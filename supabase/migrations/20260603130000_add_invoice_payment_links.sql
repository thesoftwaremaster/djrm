alter table public.invoices
  add column if not exists payment_provider text,
  add column if not exists payment_link_url text,
  add column if not exists payment_session_id text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists amount_paid numeric not null default 0,
  add column if not exists balance_due numeric,
  add column if not exists deposit_amount numeric,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists paid_at timestamptz;

alter table public.payments
  add column if not exists payment_provider text,
  add column if not exists payment_session_id text,
  add column if not exists payment_provider_event_id text;

create unique index if not exists payments_user_payment_session_unique
on public.payments (user_id, payment_session_id)
where payment_session_id is not null;

create index if not exists invoices_user_payment_session_idx
on public.invoices (user_id, payment_session_id)
where payment_session_id is not null;

create or replace function public.refresh_invoice_payment_rollup(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record record;
  paid_total numeric := 0;
  next_payment_status text := 'unpaid';
  next_invoice_status text;
  first_deposit_paid_at timestamptz;
  first_paid_at timestamptz;
  previous_request_sub text;
begin
  if target_invoice_id is null then
    return;
  end if;

  select id, user_id, total, status
  into invoice_record
  from public.invoices
  where id = target_invoice_id;

  if invoice_record.id is null then
    return;
  end if;

  select
    coalesce(sum(amount) filter (where paid is true), 0),
    min(created_at) filter (where paid is true and type = 'deposit'),
    min(created_at) filter (where paid is true)
  into paid_total, first_deposit_paid_at, first_paid_at
  from public.payments
  where invoice_id = target_invoice_id;

  if paid_total <= 0 then
    next_payment_status := 'unpaid';
  elsif paid_total >= coalesce(invoice_record.total, 0) then
    next_payment_status := 'paid';
  else
    next_payment_status := 'partially_paid';
  end if;

  next_invoice_status := invoice_record.status;

  if invoice_record.status <> 'cancelled' then
    if next_payment_status = 'paid' then
      next_invoice_status := 'paid';
    elsif invoice_record.status = 'paid' and next_payment_status <> 'paid' then
      next_invoice_status := 'sent';
    end if;
  end if;

  previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', invoice_record.user_id::text, true);

    update public.invoices
    set
      amount_paid = paid_total,
      balance_due = greatest(coalesce(total, 0) - paid_total, 0),
      payment_status = next_payment_status,
      deposit_paid_at = first_deposit_paid_at,
      paid_at = case when next_payment_status = 'paid' then coalesce(paid_at, first_paid_at, now()) else null end,
      status = next_invoice_status
    where id = target_invoice_id;

    perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
      raise;
  end;
end;
$$;

create or replace function public.refresh_invoice_payment_rollup_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP in ('INSERT', 'UPDATE') then
    perform public.refresh_invoice_payment_rollup(NEW.invoice_id);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    perform public.refresh_invoice_payment_rollup(OLD.invoice_id);
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists refresh_invoice_payment_rollup_after_write on public.payments;

create trigger refresh_invoice_payment_rollup_after_write
after insert or update or delete on public.payments
for each row execute function public.refresh_invoice_payment_rollup_trigger();

do $$
declare
  invoice_row record;
begin
  for invoice_row in select id from public.invoices
  loop
    perform public.refresh_invoice_payment_rollup(invoice_row.id);
  end loop;
end $$;

comment on column public.invoices.payment_link_url is 'Provider-hosted checkout URL. Created server-side only.';
comment on column public.invoices.payment_session_id is 'Provider checkout/session id for webhook reconciliation.';
comment on column public.invoices.amount_paid is 'Rollup from paid payment records, including manual and online payments.';
comment on column public.invoices.balance_due is 'Invoice total minus amount_paid, clamped to zero.';

create or replace function public.record_online_invoice_payment(
  provider_name text,
  provider_session_id text,
  provider_event_id text,
  amount_received numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record record;
  existing_payment_id uuid;
  created_payment_id uuid;
  previous_request_sub text;
begin
  if provider_session_id is null or amount_received is null or amount_received <= 0 then
    raise exception 'A provider session id and positive amount are required';
  end if;

  select id, user_id, booking_id
  into invoice_record
  from public.invoices
  where payment_provider = provider_name
    and payment_session_id = provider_session_id
  limit 1;

  if invoice_record.id is null then
    raise exception 'Invoice not found for provider session';
  end if;

  select id into existing_payment_id
  from public.payments
  where user_id = invoice_record.user_id
    and payment_session_id = provider_session_id
  limit 1;

  if existing_payment_id is not null then
    perform public.refresh_invoice_payment_rollup(invoice_record.id);
    return existing_payment_id;
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
      payment_provider_event_id
    )
    values (
      invoice_record.user_id,
      invoice_record.booking_id,
      invoice_record.id,
      amount_received,
      'other',
      true,
      current_date,
      provider_name,
      provider_session_id,
      provider_event_id
    )
    returning id into created_payment_id;

    perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);
      raise;
  end;

  return created_payment_id;
end;
$$;

revoke all on function public.record_online_invoice_payment(text, text, text, numeric) from public;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric) from anon;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric) from authenticated;
grant execute on function public.record_online_invoice_payment(text, text, text, numeric) to service_role;
