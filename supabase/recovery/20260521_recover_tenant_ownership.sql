-- Tenant ownership recovery script.
--
-- Run the diagnostics first:
--   supabase/recovery/20260521_tenant_recovery_diagnostics.sql
--
-- Safety:
-- - No rows are deleted.
-- - RLS policies are not loosened.
-- - The script aborts unless both demo and personal users exist.
-- - Replace the personal email below before running.

begin;

do $$
declare
  demo_user_id uuid;
  personal_user_id uuid;
  personal_email text := 'REPLACE_WITH_PERSONAL_EMAIL';
  take_over_other_non_demo_owned_rows boolean := false;
begin
  if personal_email like 'REPLACE_WITH_%' then
    raise exception 'Set personal_email in this recovery script before running it.';
  end if;

  select id into demo_user_id
  from auth.users
  where lower(email) = 'demo@djrm.co';

  if demo_user_id is null then
    raise exception 'Could not find auth user demo@djrm.co.';
  end if;

  select id into personal_user_id
  from auth.users
  where lower(email) = lower(personal_email);

  if personal_user_id is null then
    raise exception 'Could not find personal auth user %.', personal_email;
  end if;

  if personal_user_id = demo_user_id then
    raise exception 'Personal user cannot be the demo user.';
  end if;

  -- Disable the ownership-enforcement trigger only for this controlled
  -- recovery transaction. RLS remains unchanged.
  alter table public.clients disable trigger enforce_crm_tenant_before_write;
  alter table public.enquiries disable trigger enforce_crm_tenant_before_write;
  alter table public.bookings disable trigger enforce_crm_tenant_before_write;
  alter table public.events disable trigger enforce_crm_tenant_before_write;
  alter table public.invoices disable trigger enforce_crm_tenant_before_write;
  alter table public.invoice_items disable trigger enforce_crm_tenant_before_write;
  alter table public.payments disable trigger enforce_crm_tenant_before_write;
  alter table public.booking_contracts disable trigger enforce_crm_tenant_before_write;
  alter table public.tasks disable trigger enforce_crm_tenant_before_write;
  alter table public.activity_logs disable trigger enforce_crm_tenant_before_write;

  -- Root ownership assignment.
  -- Demo markers come directly from src/utils/demoSeed.js:
  -- demo client emails, DEMO invoice numbers, Demo notes/settings, demo task sources.
  update public.clients
  set user_id = demo_user_id
  where email like '%.demo@djrm.co';

  update public.clients
  set user_id = personal_user_id
  where user_id is null
     or (
       take_over_other_non_demo_owned_rows
       and user_id <> demo_user_id
       and email not like '%.demo@djrm.co'
     );

  update public.app_settings
  set user_id = demo_user_id
  where contact_email = 'demo@djrm.co'
     or invoice_prefix = 'DEMO'
     or business_name ilike '%demo%';

  update public.app_settings
  set user_id = personal_user_id
  where user_id is null
     or (
       take_over_other_non_demo_owned_rows
       and user_id <> demo_user_id
       and not (
         contact_email = 'demo@djrm.co'
         or invoice_prefix = 'DEMO'
         or business_name ilike '%demo%'
       )
     );

  update public.enquiries
  set user_id = demo_user_id
  where notes ilike '%demo enquiry%';

  update public.enquiries
  set user_id = clients.user_id
  from public.clients
  where enquiries.client_id = clients.id
    and enquiries.user_id is distinct from clients.user_id;

  update public.enquiries
  set user_id = personal_user_id
  where user_id is null;

  update public.bookings
  set user_id = enquiries.user_id
  from public.enquiries
  where bookings.enquiry_id = enquiries.id
    and bookings.user_id is distinct from enquiries.user_id;

  update public.bookings
  set user_id = personal_user_id
  where user_id is null;

  update public.invoices
  set user_id = demo_user_id
  where invoice_number like 'DEMO-%'
     or notes ilike '%demo invoice%';

  update public.invoices
  set user_id = bookings.user_id
  from public.bookings
  where invoices.booking_id = bookings.id
    and invoices.user_id is distinct from bookings.user_id;

  update public.invoices
  set user_id = clients.user_id
  from public.clients
  where invoices.client_id = clients.id
    and invoices.user_id is distinct from clients.user_id;

  update public.invoices
  set user_id = personal_user_id
  where user_id is null;

  -- Child ownership inheritance.
  update public.events
  set user_id = demo_user_id
  where notes ilike '%demo event%';

  update public.events
  set user_id = bookings.user_id
  from public.bookings
  where events.booking_id = bookings.id
    and events.user_id is distinct from bookings.user_id;

  update public.events
  set user_id = personal_user_id
  where user_id is null;

  update public.invoice_items
  set user_id = invoices.user_id
  from public.invoices
  where invoice_items.invoice_id = invoices.id
    and invoice_items.user_id is distinct from invoices.user_id;

  update public.invoice_items
  set user_id = personal_user_id
  where user_id is null;

  update public.payments
  set user_id = invoices.user_id
  from public.invoices
  where payments.invoice_id = invoices.id
    and payments.user_id is distinct from invoices.user_id;

  update public.payments
  set user_id = bookings.user_id
  from public.bookings
  where payments.invoice_id is null
    and payments.booking_id = bookings.id
    and payments.user_id is distinct from bookings.user_id;

  update public.payments
  set user_id = personal_user_id
  where user_id is null;

  update public.booking_contracts
  set user_id = bookings.user_id
  from public.bookings
  where booking_contracts.booking_id = bookings.id
    and booking_contracts.user_id is distinct from bookings.user_id;

  update public.booking_contracts
  set user_id = personal_user_id
  where user_id is null;

  update public.tasks
  set user_id = demo_user_id
  where source like 'demo:%';

  update public.tasks
  set user_id = invoices.user_id
  from public.invoices
  where tasks.invoice_id = invoices.id
    and tasks.user_id is distinct from invoices.user_id;

  update public.tasks
  set user_id = bookings.user_id
  from public.bookings
  where tasks.booking_id = bookings.id
    and tasks.user_id is distinct from bookings.user_id;

  update public.tasks
  set user_id = clients.user_id
  from public.clients
  where tasks.client_id = clients.id
    and tasks.user_id is distinct from clients.user_id;

  update public.tasks
  set user_id = personal_user_id
  where user_id is null;

  update public.activity_logs
  set user_id = bookings.user_id
  from public.bookings
  where activity_logs.booking_id = bookings.id
    and activity_logs.user_id is distinct from bookings.user_id;

  update public.activity_logs
  set user_id = clients.user_id
  from public.clients
  where activity_logs.client_id = clients.id
    and activity_logs.user_id is distinct from clients.user_id;

  update public.activity_logs
  set user_id = clients.user_id
  from public.clients
  where activity_logs.entity_type = 'client'
    and activity_logs.entity_id = clients.id
    and activity_logs.user_id is distinct from clients.user_id;

  update public.activity_logs
  set user_id = enquiries.user_id
  from public.enquiries
  where activity_logs.entity_type = 'enquiry'
    and activity_logs.entity_id = enquiries.id
    and activity_logs.user_id is distinct from enquiries.user_id;

  update public.activity_logs
  set user_id = bookings.user_id
  from public.bookings
  where activity_logs.entity_type = 'booking'
    and activity_logs.entity_id = bookings.id
    and activity_logs.user_id is distinct from bookings.user_id;

  update public.activity_logs
  set user_id = invoices.user_id
  from public.invoices
  where activity_logs.entity_type = 'invoice'
    and activity_logs.entity_id = invoices.id
    and activity_logs.user_id is distinct from invoices.user_id;

  update public.activity_logs
  set user_id = payments.user_id
  from public.payments
  where activity_logs.entity_type = 'payment'
    and activity_logs.entity_id = payments.id
    and activity_logs.user_id is distinct from payments.user_id;

  update public.activity_logs
  set user_id = booking_contracts.user_id
  from public.booking_contracts
  where activity_logs.entity_type = 'booking_contract'
    and activity_logs.entity_id = booking_contracts.id
    and activity_logs.user_id is distinct from booking_contracts.user_id;

  update public.activity_logs
  set user_id = tasks.user_id
  from public.tasks
  where activity_logs.entity_type = 'task'
    and activity_logs.entity_id = tasks.id
    and activity_logs.user_id is distinct from tasks.user_id;

  update public.activity_logs
  set user_id = personal_user_id
  where user_id is null;

  -- Re-enable the write-protection trigger.
  alter table public.clients enable trigger enforce_crm_tenant_before_write;
  alter table public.enquiries enable trigger enforce_crm_tenant_before_write;
  alter table public.bookings enable trigger enforce_crm_tenant_before_write;
  alter table public.events enable trigger enforce_crm_tenant_before_write;
  alter table public.invoices enable trigger enforce_crm_tenant_before_write;
  alter table public.invoice_items enable trigger enforce_crm_tenant_before_write;
  alter table public.payments enable trigger enforce_crm_tenant_before_write;
  alter table public.booking_contracts enable trigger enforce_crm_tenant_before_write;
  alter table public.tasks enable trigger enforce_crm_tenant_before_write;
  alter table public.activity_logs enable trigger enforce_crm_tenant_before_write;
end $$;

-- Abort before commit if any CRM rows remain unowned.
do $$
declare
  remaining_nulls integer;
begin
  select sum(null_rows)::integer into remaining_nulls
  from (
    select count(*) as null_rows from public.clients where user_id is null
    union all select count(*) from public.enquiries where user_id is null
    union all select count(*) from public.bookings where user_id is null
    union all select count(*) from public.events where user_id is null
    union all select count(*) from public.invoices where user_id is null
    union all select count(*) from public.invoice_items where user_id is null
    union all select count(*) from public.payments where user_id is null
    union all select count(*) from public.booking_contracts where user_id is null
    union all select count(*) from public.tasks where user_id is null
    union all select count(*) from public.activity_logs where user_id is null
  ) counts;

  if coalesce(remaining_nulls, 0) > 0 then
    raise exception 'Recovery left % CRM rows with null user_id.', remaining_nulls;
  end if;
end $$;

commit;
