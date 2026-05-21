-- Tenant recovery diagnostics.
-- Run this BEFORE and AFTER the recovery script.
-- This file is read-only.

-- 1. Current auth users and ids.
select
  id,
  email,
  created_at,
  last_sign_in_at
from auth.users
order by created_at;

-- 2. Tables currently carrying a tenant/owner-style column.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and column_name in ('user_id', 'account_id', 'owner_id')
order by table_name, column_name;

-- 3. User ownership counts by CRM table.
with crm_counts as (
  select 'clients' as table_name, user_id, count(*) as row_count from public.clients group by user_id
  union all
  select 'enquiries', user_id, count(*) from public.enquiries group by user_id
  union all
  select 'bookings', user_id, count(*) from public.bookings group by user_id
  union all
  select 'events', user_id, count(*) from public.events group by user_id
  union all
  select 'invoices', user_id, count(*) from public.invoices group by user_id
  union all
  select 'invoice_items', user_id, count(*) from public.invoice_items group by user_id
  union all
  select 'payments', user_id, count(*) from public.payments group by user_id
  union all
  select 'booking_contracts', user_id, count(*) from public.booking_contracts group by user_id
  union all
  select 'tasks', user_id, count(*) from public.tasks group by user_id
  union all
  select 'activity_logs', user_id, count(*) from public.activity_logs group by user_id
  union all
  select 'app_settings', user_id, count(*) from public.app_settings group by user_id
)
select
  crm_counts.table_name,
  coalesce(auth.users.email, '[null user_id]') as owner_email,
  crm_counts.user_id,
  crm_counts.row_count
from crm_counts
left join auth.users on auth.users.id = crm_counts.user_id
order by crm_counts.table_name, owner_email;

-- 4. Null user_id rows.
with null_counts as (
  select 'clients' as table_name, count(*) as null_rows from public.clients where user_id is null
  union all
  select 'enquiries', count(*) from public.enquiries where user_id is null
  union all
  select 'bookings', count(*) from public.bookings where user_id is null
  union all
  select 'events', count(*) from public.events where user_id is null
  union all
  select 'invoices', count(*) from public.invoices where user_id is null
  union all
  select 'invoice_items', count(*) from public.invoice_items where user_id is null
  union all
  select 'payments', count(*) from public.payments where user_id is null
  union all
  select 'booking_contracts', count(*) from public.booking_contracts where user_id is null
  union all
  select 'tasks', count(*) from public.tasks where user_id is null
  union all
  select 'activity_logs', count(*) from public.activity_logs where user_id is null
)
select *
from null_counts
where null_rows > 0
order by table_name;

-- 5. Rows that are clearly demo-marked by the current demoSeed markers.
with demo_marked as (
  select 'clients' as table_name, user_id, count(*) as row_count
  from public.clients
  where email like '%.demo@djrm.co'
  group by user_id
  union all
  select 'enquiries', user_id, count(*)
  from public.enquiries
  where notes ilike '%demo enquiry%'
  group by user_id
  union all
  select 'events', user_id, count(*)
  from public.events
  where notes ilike '%demo event%'
  group by user_id
  union all
  select 'invoices', user_id, count(*)
  from public.invoices
  where invoice_number like 'DEMO-%'
     or notes ilike '%demo invoice%'
  group by user_id
  union all
  select 'tasks', user_id, count(*)
  from public.tasks
  where source like 'demo:%'
  group by user_id
  union all
  select 'app_settings', user_id, count(*)
  from public.app_settings
  where contact_email = 'demo@djrm.co'
     or invoice_prefix = 'DEMO'
     or business_name ilike '%demo%'
  group by user_id
)
select
  demo_marked.table_name,
  coalesce(auth.users.email, '[null user_id]') as owner_email,
  demo_marked.user_id,
  demo_marked.row_count
from demo_marked
left join auth.users on auth.users.id = demo_marked.user_id
order by table_name, owner_email;

-- 6. Child rows whose user_id does not match their parent.
select 'enquiries.client_id' as relation, count(*) as mismatched_rows
from public.enquiries child
join public.clients parent on parent.id = child.client_id
where child.user_id is distinct from parent.user_id
union all
select 'bookings.enquiry_id', count(*)
from public.bookings child
join public.enquiries parent on parent.id = child.enquiry_id
where child.user_id is distinct from parent.user_id
union all
select 'events.booking_id', count(*)
from public.events child
join public.bookings parent on parent.id = child.booking_id
where child.user_id is distinct from parent.user_id
union all
select 'invoices.client_id', count(*)
from public.invoices child
join public.clients parent on parent.id = child.client_id
where child.user_id is distinct from parent.user_id
union all
select 'invoices.booking_id', count(*)
from public.invoices child
join public.bookings parent on parent.id = child.booking_id
where child.booking_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'invoice_items.invoice_id', count(*)
from public.invoice_items child
join public.invoices parent on parent.id = child.invoice_id
where child.user_id is distinct from parent.user_id
union all
select 'payments.invoice_id', count(*)
from public.payments child
join public.invoices parent on parent.id = child.invoice_id
where child.invoice_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'payments.booking_id', count(*)
from public.payments child
join public.bookings parent on parent.id = child.booking_id
where child.booking_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'booking_contracts.booking_id', count(*)
from public.booking_contracts child
join public.bookings parent on parent.id = child.booking_id
where child.user_id is distinct from parent.user_id
union all
select 'tasks.client_id', count(*)
from public.tasks child
join public.clients parent on parent.id = child.client_id
where child.client_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'tasks.booking_id', count(*)
from public.tasks child
join public.bookings parent on parent.id = child.booking_id
where child.booking_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'tasks.invoice_id', count(*)
from public.tasks child
join public.invoices parent on parent.id = child.invoice_id
where child.invoice_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'activity_logs.client_id', count(*)
from public.activity_logs child
join public.clients parent on parent.id = child.client_id
where child.client_id is not null
  and child.user_id is distinct from parent.user_id
union all
select 'activity_logs.booking_id', count(*)
from public.activity_logs child
join public.bookings parent on parent.id = child.booking_id
where child.booking_id is not null
  and child.user_id is distinct from parent.user_id
order by relation;
