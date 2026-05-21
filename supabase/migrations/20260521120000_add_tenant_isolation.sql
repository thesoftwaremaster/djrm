-- Tenant isolation for browser-owned CRM data.
--
-- Existing rows are intentionally left with user_id = null because this
-- project previously had no reliable owner column to backfill from. Those
-- rows become hidden by RLS until a maintainer assigns them to the correct
-- auth.users.id after verifying ownership.

create extension if not exists pgcrypto;

do $$
declare
  crm_table text;
  existing_policy record;
  crm_tables text[] := array[
    'clients',
    'enquiries',
    'bookings',
    'events',
    'invoices',
    'invoice_items',
    'payments',
    'booking_contracts',
    'tasks',
    'activity_logs'
  ];
begin
  revoke all on all sequences in schema public from anon;
  grant usage, select on all sequences in schema public to authenticated;

  foreach crm_table in array crm_tables
  loop
    execute format(
      'alter table public.%I add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade',
      crm_table
    );
    execute format('create index if not exists %I on public.%I (user_id)', crm_table || '_user_id_idx', crm_table);
    execute format('alter table public.%I enable row level security', crm_table);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = crm_table
        and policyname not like '%demo_no_delete'
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        crm_table
      );
    end loop;

    execute format('revoke all on table public.%I from anon', crm_table);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      crm_table || '_user_select',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      crm_table || '_user_insert',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      crm_table || '_user_update',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      crm_table || '_user_delete',
      crm_table
    );
  end loop;
end $$;

drop index if exists public.invoices_invoice_number_unique;
drop index if exists public.tasks_generated_source_entity_key;

create unique index if not exists invoices_user_invoice_number_unique
on public.invoices (user_id, invoice_number)
where invoice_number is not null and user_id is not null;

create unique index if not exists tasks_user_generated_source_entity_key
on public.tasks (user_id, source, entity_type, entity_id)
where user_id is not null
  and source <> 'manual'
  and entity_type is not null
  and entity_id is not null;

create index if not exists enquiries_user_client_id_idx on public.enquiries (user_id, client_id);
create index if not exists bookings_user_enquiry_id_idx on public.bookings (user_id, enquiry_id);
create index if not exists events_user_booking_id_idx on public.events (user_id, booking_id);
create index if not exists invoices_user_client_id_idx on public.invoices (user_id, client_id);
create index if not exists invoices_user_booking_id_idx on public.invoices (user_id, booking_id);
create index if not exists invoice_items_user_invoice_id_idx on public.invoice_items (user_id, invoice_id);
create index if not exists payments_user_invoice_id_idx on public.payments (user_id, invoice_id);
create index if not exists payments_user_booking_id_idx on public.payments (user_id, booking_id);
create index if not exists booking_contracts_user_booking_id_idx on public.booking_contracts (user_id, booking_id);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists activity_logs_user_booking_created_at_idx on public.activity_logs (user_id, booking_id, created_at desc);

create or replace function public.enforce_crm_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_user_id uuid := auth.uid();
  parent_owner_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if TG_OP = 'INSERT' and NEW.user_id is null then
    NEW.user_id := request_user_id;
  end if;

  if NEW.user_id is distinct from request_user_id then
    raise exception 'CRM row user_id must match the authenticated user';
  end if;

  if TG_OP = 'UPDATE' and NEW.user_id is distinct from OLD.user_id then
    raise exception 'CRM row user_id cannot be changed';
  end if;

  if TG_TABLE_NAME = 'enquiries' then
    select user_id into parent_owner_id from public.clients where id = NEW.client_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Enquiry client belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'bookings' then
    select user_id into parent_owner_id from public.enquiries where id = NEW.enquiry_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Booking enquiry belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'events' then
    select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Event booking belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'invoices' then
    select user_id into parent_owner_id from public.clients where id = NEW.client_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Invoice client belongs to another user';
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Invoice booking belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'invoice_items' then
    select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Invoice item invoice belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'payments' then
    if NEW.invoice_id is not null then
      select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Payment invoice belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Payment booking belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'booking_contracts' then
    select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Contract booking belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'tasks' then
    if NEW.client_id is not null then
      select user_id into parent_owner_id from public.clients where id = NEW.client_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task client belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task booking belongs to another user';
      end if;
    end if;

    if NEW.invoice_id is not null then
      select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task invoice belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'activity_logs' then
    if NEW.client_id is not null then
      select user_id into parent_owner_id from public.clients where id = NEW.client_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Activity client belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Activity booking belongs to another user';
      end if;
    end if;

    if NEW.entity_type = 'client' then
      select user_id into parent_owner_id from public.clients where id = NEW.entity_id;
    elsif NEW.entity_type = 'enquiry' then
      select user_id into parent_owner_id from public.enquiries where id = NEW.entity_id;
    elsif NEW.entity_type = 'booking' then
      select user_id into parent_owner_id from public.bookings where id = NEW.entity_id;
    elsif NEW.entity_type = 'invoice' then
      select user_id into parent_owner_id from public.invoices where id = NEW.entity_id;
    elsif NEW.entity_type = 'payment' then
      select user_id into parent_owner_id from public.payments where id = NEW.entity_id;
    elsif NEW.entity_type = 'booking_contract' then
      select user_id into parent_owner_id from public.booking_contracts where id = NEW.entity_id;
    elsif NEW.entity_type = 'task' then
      select user_id into parent_owner_id from public.tasks where id = NEW.entity_id;
    else
      parent_owner_id := NEW.user_id;
    end if;

    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Activity entity belongs to another user';
    end if;
  end if;

  return NEW;
end;
$$;

do $$
declare
  crm_table text;
  crm_tables text[] := array[
    'clients',
    'enquiries',
    'bookings',
    'events',
    'invoices',
    'invoice_items',
    'payments',
    'booking_contracts',
    'tasks',
    'activity_logs'
  ];
begin
  foreach crm_table in array crm_tables
  loop
    execute format('drop trigger if exists enforce_crm_tenant_before_write on public.%I', crm_table);
    execute format(
      'create trigger enforce_crm_tenant_before_write before insert or update on public.%I for each row execute function public.enforce_crm_tenant()',
      crm_table
    );
  end loop;
end $$;

-- Contract files must live under the authenticated user's folder:
-- contracts/{auth.uid()}/{booking_id}/{timestamp}-{file_name}
drop policy if exists contracts_authenticated_select on storage.objects;
drop policy if exists contracts_authenticated_insert on storage.objects;
drop policy if exists contracts_authenticated_update on storage.objects;
drop policy if exists contracts_authenticated_delete on storage.objects;
drop policy if exists contracts_user_select on storage.objects;
drop policy if exists contracts_user_insert on storage.objects;
drop policy if exists contracts_user_update on storage.objects;
drop policy if exists contracts_user_delete on storage.objects;

create policy contracts_user_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'contracts'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

create policy contracts_user_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'contracts'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

create policy contracts_user_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'contracts'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
)
with check (
  bucket_id = 'contracts'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

create policy contracts_user_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'contracts'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

comment on column public.clients.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.enquiries.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.bookings.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.events.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.invoices.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.invoice_items.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.payments.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.booking_contracts.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.tasks.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
comment on column public.activity_logs.user_id is 'Tenant owner. Existing pre-isolation rows may be null until manually assigned.';
