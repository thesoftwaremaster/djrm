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
  v_next_invoice_status text := 'draft';
  v_first_deposit_paid_at timestamptz;
  v_first_paid_at timestamptz;
  v_previous_request_sub text;
begin
  if target_invoice_id is null then
    return;
  end if;

  select
    inv.id,
    inv.user_id,
    inv.client_id,
    inv.booking_id,
    inv.invoice_number,
    inv.total,
    inv.status,
    inv.invoice_sent_at,
    inv.last_sent_at,
    inv.due_date,
    inv.paid_at
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
  elsif v_paid_total >= coalesce(v_invoice_record.total, 0) and coalesce(v_invoice_record.total, 0) > 0 then
    v_next_payment_status := 'paid';
  else
    v_next_payment_status := 'partially_paid';
  end if;

  if v_invoice_record.status = 'cancelled' then
    v_next_invoice_status := 'cancelled';
  elsif v_next_payment_status = 'paid' then
    v_next_invoice_status := 'paid';
  elsif v_paid_total > 0 then
    v_next_invoice_status := 'part_paid';
  elsif v_invoice_record.due_date is not null and v_invoice_record.due_date < current_date then
    v_next_invoice_status := 'overdue';
  elsif v_invoice_record.invoice_sent_at is not null or v_invoice_record.last_sent_at is not null then
    v_next_invoice_status := 'sent';
  else
    v_next_invoice_status := 'draft';
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

    if v_next_invoice_status = 'paid'
      and v_invoice_record.booking_id is not null
    then
      update public.bookings as booking
      set status = 'confirmed'
      where booking.id = v_invoice_record.booking_id
        and booking.user_id = v_invoice_record.user_id
        and booking.status not in ('completed', 'cancelled');
    end if;

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
