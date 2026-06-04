alter table public.invoices
  add column if not exists receipt_send_attempted_at timestamptz,
  add column if not exists receipt_send_error text,
  add column if not exists owner_notification_attempted_at timestamptz,
  add column if not exists owner_notification_error text;

update public.invoices
set receipt_send_attempted_at = coalesce(receipt_send_attempted_at, receipt_sent_at)
where receipt_sent_at is not null
  and receipt_send_attempted_at is null;

update public.invoices
set owner_notification_attempted_at = coalesce(owner_notification_attempted_at, owner_notified_at)
where owner_notified_at is not null
  and owner_notification_attempted_at is null;

create index if not exists invoices_paid_receipt_retry_idx
on public.invoices (user_id, paid_at)
where status = 'paid'
  and payment_status = 'paid'
  and receipt_sent_at is null;

create index if not exists invoices_paid_owner_notification_retry_idx
on public.invoices (user_id, paid_at)
where status = 'paid'
  and payment_status = 'paid'
  and owner_notified_at is null;

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
  v_notification_kind text;
  v_previous_request_sub text;
  v_claimed boolean := false;
begin
  v_notification_kind := case
    when notification_field in ('receipt', 'receipt_sent_at') then 'receipt'
    when notification_field in ('owner', 'owner_notified_at') then 'owner'
    else null
  end;

  if target_invoice_id is null or v_notification_kind is null then
    return false;
  end if;

  select
    inv.id,
    inv.user_id,
    inv.status,
    inv.payment_status,
    inv.receipt_sent_at,
    inv.receipt_send_attempted_at,
    inv.owner_notified_at,
    inv.owner_notification_attempted_at
  into v_invoice
  from public.invoices as inv
  where inv.id = target_invoice_id;

  if v_invoice.id is null or v_invoice.status <> 'paid' or v_invoice.payment_status <> 'paid' then
    return false;
  end if;

  if v_notification_kind = 'receipt' and v_invoice.receipt_sent_at is not null then
    return false;
  end if;

  if v_notification_kind = 'owner' and v_invoice.owner_notified_at is not null then
    return false;
  end if;

  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', v_invoice.user_id::text, true);

    if v_notification_kind = 'receipt' then
      update public.invoices as inv
      set receipt_send_attempted_at = now(),
          receipt_send_error = null
      where inv.id = target_invoice_id
        and inv.user_id = v_invoice.user_id
        and inv.status = 'paid'
        and inv.payment_status = 'paid'
        and inv.receipt_sent_at is null
        and (
          inv.receipt_send_attempted_at is null
          or inv.receipt_send_attempted_at < now() - interval '10 minutes'
          or inv.receipt_send_error is not null
        );
    else
      update public.invoices as inv
      set owner_notification_attempted_at = now(),
          owner_notification_error = null
      where inv.id = target_invoice_id
        and inv.user_id = v_invoice.user_id
        and inv.status = 'paid'
        and inv.payment_status = 'paid'
        and inv.owner_notified_at is null
        and (
          inv.owner_notification_attempted_at is null
          or inv.owner_notification_attempted_at < now() - interval '10 minutes'
          or inv.owner_notification_error is not null
        );
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

create or replace function public.complete_paid_invoice_notification(
  target_invoice_id uuid,
  notification_field text,
  error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_notification_kind text;
  v_previous_request_sub text;
  v_completed boolean := false;
begin
  v_notification_kind := case
    when notification_field in ('receipt', 'receipt_sent_at') then 'receipt'
    when notification_field in ('owner', 'owner_notified_at') then 'owner'
    else null
  end;

  if target_invoice_id is null or v_notification_kind is null then
    return false;
  end if;

  select inv.id, inv.user_id, inv.status, inv.payment_status
  into v_invoice
  from public.invoices as inv
  where inv.id = target_invoice_id;

  if v_invoice.id is null or v_invoice.status <> 'paid' or v_invoice.payment_status <> 'paid' then
    return false;
  end if;

  v_previous_request_sub := current_setting('request.jwt.claim.sub', true);

  begin
    perform set_config('request.jwt.claim.sub', v_invoice.user_id::text, true);

    if v_notification_kind = 'receipt' then
      if error_message is null then
        update public.invoices as inv
        set receipt_sent_at = now(),
            receipt_send_error = null
        where inv.id = target_invoice_id
          and inv.user_id = v_invoice.user_id
          and inv.status = 'paid'
          and inv.payment_status = 'paid'
          and inv.receipt_sent_at is null;
      else
        update public.invoices as inv
        set receipt_send_error = left(error_message, 1000)
        where inv.id = target_invoice_id
          and inv.user_id = v_invoice.user_id
          and inv.status = 'paid'
          and inv.payment_status = 'paid'
          and inv.receipt_sent_at is null;
      end if;
    else
      if error_message is null then
        update public.invoices as inv
        set owner_notified_at = now(),
            owner_notification_error = null
        where inv.id = target_invoice_id
          and inv.user_id = v_invoice.user_id
          and inv.status = 'paid'
          and inv.payment_status = 'paid'
          and inv.owner_notified_at is null;
      else
        update public.invoices as inv
        set owner_notification_error = left(error_message, 1000)
        where inv.id = target_invoice_id
          and inv.user_id = v_invoice.user_id
          and inv.status = 'paid'
          and inv.payment_status = 'paid'
          and inv.owner_notified_at is null;
      end if;
    end if;

    v_completed := found;

    perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
  exception
    when others then
      perform set_config('request.jwt.claim.sub', coalesce(v_previous_request_sub, ''), true);
      raise;
  end;

  return v_completed;
end;
$$;

revoke all on function public.claim_paid_invoice_notification(uuid, text) from public;
revoke all on function public.claim_paid_invoice_notification(uuid, text) from anon;
revoke all on function public.claim_paid_invoice_notification(uuid, text) from authenticated;
grant execute on function public.claim_paid_invoice_notification(uuid, text) to service_role;

revoke all on function public.complete_paid_invoice_notification(uuid, text, text) from public;
revoke all on function public.complete_paid_invoice_notification(uuid, text, text) from anon;
revoke all on function public.complete_paid_invoice_notification(uuid, text, text) from authenticated;
grant execute on function public.complete_paid_invoice_notification(uuid, text, text) to service_role;
