alter table public.invoices
  add column if not exists receipt_sent_at timestamptz,
  add column if not exists owner_notified_at timestamptz;

create index if not exists invoices_user_paid_notifications_idx
on public.invoices (user_id, paid_at)
where status = 'paid' and (receipt_sent_at is null or owner_notified_at is null);

create index if not exists invoices_user_overdue_due_date_idx
on public.invoices (user_id, due_date)
where status not in ('paid', 'cancelled');

create or replace function public.refresh_invoice_payment_rollup(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_record record;
  v_paid_total numeric := 0;
  v_next_payment_status text := 'unpaid';
  v_next_invoice_status text;
  v_first_deposit_paid_at timestamptz;
  v_first_paid_at timestamptz;
  v_previous_request_sub text;
begin
  if target_invoice_id is null then
    return;
  end if;

  select inv.id, inv.user_id, inv.client_id, inv.booking_id, inv.invoice_number, inv.total, inv.status
  into v_invoice_record
  from public.invoices as inv
  where inv.id = target_invoice_id;

  if v_invoice_record.id is null then
    return;
  end if;

  select
    coalesce(sum(p.amount) filter (where p.paid is true), 0),
    min(p.created_at) filter (where p.paid is true and p.type = 'deposit'),
    min(p.created_at) filter (where p.paid is true)
  into v_paid_total, v_first_deposit_paid_at, v_first_paid_at
  from public.payments as p
  where p.invoice_id = target_invoice_id
    and p.user_id = v_invoice_record.user_id;

  if v_paid_total <= 0 then
    v_next_payment_status := 'unpaid';
  elsif v_paid_total >= coalesce(v_invoice_record.total, 0) then
    v_next_payment_status := 'paid';
  else
    v_next_payment_status := 'partially_paid';
  end if;

  v_next_invoice_status := v_invoice_record.status;

  if v_invoice_record.status <> 'cancelled' then
    if v_next_payment_status = 'paid' then
      v_next_invoice_status := 'paid';
    elsif v_invoice_record.status = 'paid' and v_next_payment_status <> 'paid' then
      v_next_invoice_status := 'sent';
    end if;
  end if;

  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', v_invoice_record.user_id::text, true);

    update public.invoices as inv
    set
      amount_paid = v_paid_total,
      balance_due = greatest(coalesce(inv.total, 0) - v_paid_total, 0),
      payment_status = v_next_payment_status,
      deposit_paid_at = v_first_deposit_paid_at,
      paid_at = case when v_next_payment_status = 'paid' then coalesce(inv.paid_at, v_first_paid_at, now()) else null end,
      status = v_next_invoice_status
    where inv.id = target_invoice_id;

    if v_next_payment_status = 'paid'
      and v_invoice_record.status <> 'paid'
      and not exists (
        select 1
        from public.activity_logs as al
        where al.user_id = v_invoice_record.user_id
          and al.entity_type = 'invoice'
          and al.entity_id = v_invoice_record.id
          and al.action = 'invoice_paid'
      )
    then
      insert into public.activity_logs (
        user_id,
        entity_type,
        entity_id,
        booking_id,
        client_id,
        action,
        title,
        description,
        metadata
      )
      values (
        v_invoice_record.user_id,
        'invoice',
        v_invoice_record.id,
        v_invoice_record.booking_id,
        v_invoice_record.client_id,
        'invoice_paid',
        format('Invoice %s marked as paid', coalesce(v_invoice_record.invoice_number, v_invoice_record.id::text)),
        'Invoice payment rollup reached the invoice total.',
        jsonb_build_object(
          'invoice_id', v_invoice_record.id,
          'amount_paid', v_paid_total,
          'source', 'payment_rollup'
        )
      );
    end if;

    perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
      raise;
  end;
end;
$$;

create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_updated_count integer := 0;
  v_previous_request_sub text;
begin
  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  for v_invoice in
    select inv.id, inv.user_id, inv.client_id, inv.booking_id, inv.invoice_number
    from public.invoices as inv
    where inv.due_date is not null
      and inv.due_date < current_date
      and inv.status not in ('paid', 'cancelled', 'overdue')
      and coalesce(inv.payment_status, 'unpaid') <> 'paid'
  loop
    begin
      perform set_config('request.jwt.claim.sub', v_invoice.user_id::text, true);

      update public.invoices as inv
      set status = 'overdue'
      where inv.id = v_invoice.id
        and inv.user_id = v_invoice.user_id
        and inv.status not in ('paid', 'cancelled', 'overdue')
        and coalesce(inv.payment_status, 'unpaid') <> 'paid';

      if found then
        v_updated_count := v_updated_count + 1;

        if not exists (
          select 1
          from public.activity_logs as al
          where al.user_id = v_invoice.user_id
            and al.entity_type = 'invoice'
            and al.entity_id = v_invoice.id
            and al.action = 'invoice_overdue'
        ) then
          insert into public.activity_logs (
            user_id,
            entity_type,
            entity_id,
            booking_id,
            client_id,
            action,
            title,
            description,
            metadata
          )
          values (
            v_invoice.user_id,
            'invoice',
            v_invoice.id,
            v_invoice.booking_id,
            v_invoice.client_id,
            'invoice_overdue',
            format('Invoice %s marked as overdue', coalesce(v_invoice.invoice_number, v_invoice.id::text)),
            'Invoice due date has passed and the invoice is not paid.',
            jsonb_build_object('invoice_id', v_invoice.id, 'source', 'daily_overdue_automation')
          );
        end if;
      end if;
    exception
      when others then
        perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
        raise;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);

  return v_updated_count;
end;
$$;

revoke all on function public.mark_overdue_invoices() from public;
revoke all on function public.mark_overdue_invoices() from anon;
revoke all on function public.mark_overdue_invoices() from authenticated;
grant execute on function public.mark_overdue_invoices() to service_role;

create or replace function public.claim_paid_invoice_notification(
  target_invoice_id uuid,
  notification_field text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_previous_request_sub text;
  v_claimed boolean := false;
begin
  if target_invoice_id is null or notification_field not in ('receipt_sent_at', 'owner_notified_at') then
    return false;
  end if;

  select inv.id, inv.user_id, inv.status, inv.receipt_sent_at, inv.owner_notified_at
  into v_invoice
  from public.invoices as inv
  where inv.id = target_invoice_id;

  if v_invoice.id is null or v_invoice.status <> 'paid' then
    return false;
  end if;

  if notification_field = 'receipt_sent_at' and v_invoice.receipt_sent_at is not null then
    return false;
  end if;

  if notification_field = 'owner_notified_at' and v_invoice.owner_notified_at is not null then
    return false;
  end if;

  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', v_invoice.user_id::text, true);

    if notification_field = 'receipt_sent_at' then
      update public.invoices as inv
      set receipt_sent_at = now()
      where inv.id = target_invoice_id
        and inv.user_id = v_invoice.user_id
        and inv.status = 'paid'
        and inv.receipt_sent_at is null;
    else
      update public.invoices as inv
      set owner_notified_at = now()
      where inv.id = target_invoice_id
        and inv.user_id = v_invoice.user_id
        and inv.status = 'paid'
        and inv.owner_notified_at is null;
    end if;

    v_claimed := found;

    perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
      raise;
  end;

  return v_claimed;
end;
$$;

revoke all on function public.claim_paid_invoice_notification(uuid, text) from public;
revoke all on function public.claim_paid_invoice_notification(uuid, text) from anon;
revoke all on function public.claim_paid_invoice_notification(uuid, text) from authenticated;
grant execute on function public.claim_paid_invoice_notification(uuid, text) to service_role;
