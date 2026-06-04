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
  v_invoice_record record;
  v_session_record record;
  v_existing_payment_id uuid;
  v_existing_event_payment_id uuid;
  v_created_payment_id uuid;
  v_received_currency text;
  v_provider_name text := provider_name;
  v_provider_session_id text := provider_session_id;
  v_provider_event_id text := provider_event_id;
  v_previous_request_sub text;
begin
  if v_provider_name is null or v_provider_session_id is null then
    raise exception 'A provider name and session id are required';
  end if;

  if amount_received is null or amount_received <= 0 or amount_received_minor is null or amount_received_minor <= 0 then
    raise exception 'A positive amount is required';
  end if;

  v_received_currency := lower(nullif(received_currency, ''));

  if v_received_currency is null then
    raise exception 'A payment currency is required';
  end if;

  select
    ips.payment_provider,
    ips.payment_session_id,
    ips.user_id,
    ips.invoice_id,
    ips.expected_amount_minor,
    lower(ips.expected_currency) as expected_currency,
    ips.payment_type
  into v_session_record
  from public.invoice_payment_sessions as ips
  where ips.payment_provider = v_provider_name
    and ips.payment_session_id = v_provider_session_id
  limit 1;

  if v_session_record.payment_session_id is null then
    raise exception 'Payment session not found';
  end if;

  select
    inv.id,
    inv.user_id,
    inv.booking_id,
    inv.client_id,
    inv.invoice_number
  into v_invoice_record
  from public.invoices as inv
  where inv.id = v_session_record.invoice_id
    and inv.user_id = v_session_record.user_id
  limit 1;

  if v_invoice_record.id is null then
    raise exception 'Invoice not found for provider session';
  end if;

  select p.id into v_existing_payment_id
  from public.payments as p
  where p.payment_provider = v_provider_name
    and p.payment_session_id = v_provider_session_id
  limit 1;

  if v_existing_payment_id is not null then
    perform public.refresh_invoice_payment_rollup(v_invoice_record.id);
    return v_existing_payment_id;
  end if;

  if v_provider_event_id is not null then
    select p.id into v_existing_event_payment_id
    from public.payments as p
    where p.payment_provider = v_provider_name
      and p.payment_provider_event_id = v_provider_event_id
    limit 1;

    if v_existing_event_payment_id is not null then
      perform public.refresh_invoice_payment_rollup(v_invoice_record.id);
      return v_existing_event_payment_id;
    end if;
  end if;

  if v_session_record.expected_amount_minor <> amount_received_minor then
    raise exception 'Payment amount does not match expected checkout amount';
  end if;

  if v_session_record.expected_currency <> v_received_currency then
    raise exception 'Payment currency does not match expected checkout currency';
  end if;

  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', v_invoice_record.user_id::text, true);

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
      v_invoice_record.user_id,
      v_invoice_record.booking_id,
      v_invoice_record.id,
      amount_received,
      coalesce(v_session_record.payment_type, 'other'),
      true,
      current_date,
      v_provider_name,
      v_provider_session_id,
      v_provider_event_id,
      upper(v_received_currency)
    )
    returning id into v_created_payment_id;

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
      'payment',
      v_created_payment_id,
      v_invoice_record.booking_id,
      v_invoice_record.client_id,
      'payment_received',
      'Payment received',
      format('Online payment received for invoice %s.', coalesce(v_invoice_record.invoice_number, v_invoice_record.id::text)),
      jsonb_build_object(
        'invoice_id', v_invoice_record.id,
        'payment_id', v_created_payment_id,
        'payment_provider', v_provider_name,
        'payment_session_id', v_provider_session_id,
        'amount', amount_received
      )
    );

    update public.invoice_payment_sessions as ips
    set status = 'paid',
        paid_at = now()
    where ips.payment_provider = v_provider_name
      and ips.payment_session_id = v_provider_session_id;

    perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
      raise;
  end;

  return v_created_payment_id;
end;
$$;

revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from public;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from anon;
revoke all on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) from authenticated;
grant execute on function public.record_online_invoice_payment(text, text, text, numeric, integer, text) to service_role;
