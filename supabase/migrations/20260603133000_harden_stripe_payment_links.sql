alter table public.invoices
  add column if not exists payment_session_amount_minor integer,
  add column if not exists payment_session_currency text,
  add column if not exists payment_session_payment_type text;

drop function if exists public.record_online_invoice_payment(text, text, text, numeric);

alter table public.payments
  add column if not exists payment_currency text;

create table if not exists public.invoice_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_provider text not null,
  payment_session_id text not null,
  payment_link_url text,
  expected_amount_minor integer not null,
  expected_currency text not null,
  payment_type text not null default 'other',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint invoice_payment_sessions_expected_amount_check check (expected_amount_minor > 0),
  constraint invoice_payment_sessions_status_check check (status in ('open', 'paid', 'cancelled', 'expired')),
  constraint invoice_payment_sessions_type_check check (payment_type in ('deposit', 'balance', 'other'))
);

alter table public.invoice_payment_sessions enable row level security;

revoke all on table public.invoice_payment_sessions from anon;
grant select on table public.invoice_payment_sessions to authenticated;
grant select, insert, update, delete on table public.invoice_payment_sessions to service_role;

drop policy if exists invoice_payment_sessions_user_select on public.invoice_payment_sessions;
drop policy if exists invoice_payment_sessions_user_insert on public.invoice_payment_sessions;
drop policy if exists invoice_payment_sessions_user_update on public.invoice_payment_sessions;
drop policy if exists invoice_payment_sessions_user_delete on public.invoice_payment_sessions;

create policy invoice_payment_sessions_user_select
on public.invoice_payment_sessions
for select
to authenticated
using (user_id = auth.uid());

create unique index if not exists invoices_payment_provider_session_unique
on public.invoices (payment_provider, payment_session_id)
where payment_provider is not null and payment_session_id is not null;

create unique index if not exists invoice_payment_sessions_provider_session_unique
on public.invoice_payment_sessions (payment_provider, payment_session_id);

create index if not exists invoice_payment_sessions_user_invoice_idx
on public.invoice_payment_sessions (user_id, invoice_id, created_at desc);

create unique index if not exists payments_provider_session_unique
on public.payments (payment_provider, payment_session_id)
where payment_provider is not null and payment_session_id is not null;

create unique index if not exists payments_provider_event_unique
on public.payments (payment_provider, payment_provider_event_id)
where payment_provider is not null and payment_provider_event_id is not null;

create index if not exists payments_user_invoice_paid_idx
on public.payments (user_id, invoice_id, paid);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_payment_status_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_payment_status_check
      check (payment_status in ('unpaid', 'partially_paid', 'paid'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_payment_amounts_nonnegative_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_payment_amounts_nonnegative_check
      check (
        amount_paid >= 0
        and (balance_due is null or balance_due >= 0)
        and (deposit_amount is null or deposit_amount >= 0)
        and (payment_session_amount_minor is null or payment_session_amount_minor > 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_amount_nonnegative_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_amount_nonnegative_check
      check (amount >= 0);
  end if;
end $$;

create or replace function public.record_online_invoice_payment(
  provider_name text,
  provider_session_id text,
  provider_event_id text,
  amount_received numeric,
  amount_received_minor integer,
  received_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record record;
  session_record record;
  existing_payment_id uuid;
  existing_event_payment_id uuid;
  created_payment_id uuid;
  expected_currency text;
  previous_request_sub text;
begin
  if provider_name is null or provider_session_id is null then
    raise exception 'A provider name and session id are required';
  end if;

  if amount_received is null or amount_received <= 0 or amount_received_minor is null or amount_received_minor <= 0 then
    raise exception 'A positive amount is required';
  end if;

  expected_currency := lower(nullif(received_currency, ''));

  if expected_currency is null then
    raise exception 'A payment currency is required';
  end if;

  select
    payment_provider,
    payment_session_id,
    user_id,
    invoice_id,
    expected_amount_minor,
    lower(expected_currency) as expected_currency,
    payment_type
  into session_record
  from public.invoice_payment_sessions
  where payment_provider = provider_name
    and payment_session_id = provider_session_id
  limit 1;

  if session_record.payment_session_id is null then
    raise exception 'Payment session not found';
  end if;

  select
    id,
    user_id,
    booking_id
  into invoice_record
  from public.invoices
  where id = session_record.invoice_id
    and user_id = session_record.user_id
  limit 1;

  if invoice_record.id is null then
    raise exception 'Invoice not found for provider session';
  end if;

  select id into existing_payment_id
  from public.payments
  where payment_provider = provider_name
    and payment_session_id = provider_session_id
  limit 1;

  if existing_payment_id is not null then
    perform public.refresh_invoice_payment_rollup(invoice_record.id);
    return existing_payment_id;
  end if;

  if provider_event_id is not null then
    select id into existing_event_payment_id
    from public.payments
    where payment_provider = provider_name
      and payment_provider_event_id = provider_event_id
    limit 1;

    if existing_event_payment_id is not null then
      perform public.refresh_invoice_payment_rollup(invoice_record.id);
      return existing_event_payment_id;
    end if;
  end if;

  if session_record.expected_amount_minor <> amount_received_minor then
    raise exception 'Payment amount does not match expected checkout amount';
  end if;

  if session_record.expected_currency <> expected_currency then
    raise exception 'Payment currency does not match expected checkout currency';
  end if;

  previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', invoice_record.user_id::text, true);

    insert into public.payments (
      user_id,
      booking_id,
      invoice_id,
      amount,
      type,
      paid,
      due_date,
      payment_provider,
      payment_session_id,
      payment_provider_event_id,
      payment_currency
    )
    values (
      invoice_record.user_id,
      invoice_record.booking_id,
      invoice_record.id,
      amount_received,
      coalesce(session_record.payment_type, 'other'),
      true,
      current_date,
      provider_name,
      provider_session_id,
      provider_event_id,
      upper(expected_currency)
    )
    returning id into created_payment_id;

    update public.invoice_payment_sessions
    set status = 'paid',
        paid_at = now()
    where payment_provider = provider_name
      and payment_session_id = provider_session_id;

    perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
      raise;
  end;

  return created_payment_id;
end;
$$;

revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from public;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from anon;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from authenticated;
grant execute on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) to service_role;
