-- Tester account isolation hardening.
--
-- Auth setup:
-- Create tester@djrm.co in Supabase Dashboard > Authentication > Users with
-- the temporary password ChangeMe123! when an external tester is needed.
-- Do not put this password in frontend code or committed environment files.
--
-- This migration keeps user_id as the CRM tenant owner. It also hardens optional
-- tables if they exist, and provides an optional tester seed helper that is a
-- no-op until the tester Auth user exists.

create extension if not exists pgcrypto;

do $$
declare
  optional_table text;
  existing_policy record;
  optional_tables text[] := array[
    'communication_templates',
    'uploaded_files',
    'files',
    'contracts'
  ];
begin
  foreach optional_table in array optional_tables
  loop
    if to_regclass(format('public.%I', optional_table)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade',
      optional_table
    );
    execute format('create index if not exists %I on public.%I (user_id)', optional_table || '_user_id_idx', optional_table);
    execute format('alter table public.%I enable row level security', optional_table);
    execute format('revoke all on table public.%I from anon', optional_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', optional_table);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = optional_table
        and policyname not like '%demo_no_delete'
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, optional_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      optional_table || '_user_select',
      optional_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      optional_table || '_user_insert',
      optional_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      optional_table || '_user_update',
      optional_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      optional_table || '_user_delete',
      optional_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      optional_table || '_demo_no_delete',
      optional_table
    );

    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> ''email'', '''') <> ''demo@djrm.co'')',
      optional_table || '_demo_no_delete',
      optional_table
    );
  end loop;
end $$;

create or replace function public.seed_tester_crm_data()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  tester_user_id uuid;
  tester_client_id uuid;
  tester_enquiry_id uuid;
  tester_booking_id uuid;
  tester_invoice_id uuid;
  previous_request_sub text;
begin
  select id into tester_user_id
  from auth.users
  where lower(email) = 'tester@djrm.co'
  order by created_at asc
  limit 1;

  if tester_user_id is null then
    return 'Skipped: create tester@djrm.co in Supabase Auth first, then run select public.seed_tester_crm_data();';
  end if;

  previous_request_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', tester_user_id::text, true);

  select id into tester_client_id
  from public.clients
  where user_id = tester_user_id
    and email = 'tester.client+djrm@example.com'
  order by created_at asc nulls last
  limit 1;

  if tester_client_id is null then
    insert into public.clients (user_id, name, email, phone)
    values (
      tester_user_id,
      'TESTER Client - Wedding Enquiry',
      'tester.client+djrm@example.com',
      '07123 000 111'
    )
    returning id into tester_client_id;
  end if;

  if tester_client_id is null then
    return 'Skipped: tester client could not be created.';
  end if;

  select id into tester_enquiry_id
  from public.enquiries
  where user_id = tester_user_id
    and client_id = tester_client_id
    and event_type = 'TESTER Wedding Enquiry'
  order by created_at asc nulls last
  limit 1;

  if tester_enquiry_id is null then
    insert into public.enquiries (
      user_id,
      client_id,
      event_type,
      event_date,
      venue,
      status,
      notes
    )
    values (
      tester_user_id,
      tester_client_id,
      'TESTER Wedding Enquiry',
      current_date + 45,
      'TESTER Venue - Sample Hall',
      'booked',
      'Optional tester seed record. Safe to edit or delete.'
    )
    returning id into tester_enquiry_id;
  end if;

  if tester_enquiry_id is null then
    return 'Skipped: tester enquiry could not be created.';
  end if;

  select id into tester_booking_id
  from public.bookings
  where user_id = tester_user_id
    and enquiry_id = tester_enquiry_id
  order by created_at asc nulls last
  limit 1;

  if tester_booking_id is null then
    insert into public.bookings (user_id, enquiry_id, status, total_price)
    values (
      tester_user_id,
      tester_enquiry_id,
      'pending',
      600
    )
    returning id into tester_booking_id;
  end if;

  if tester_booking_id is null then
    return 'Skipped: tester booking could not be created.';
  end if;

  if not exists (
    select 1
    from public.events
    where user_id = tester_user_id
      and booking_id = tester_booking_id
      and notes = 'TESTER Booking - Birthday Party'
  ) then
    insert into public.events (user_id, booking_id, location, start_time, end_time, notes)
    values (
      tester_user_id,
      tester_booking_id,
      'TESTER Venue - Birthday Party Room',
      (current_date + 45 + time '19:00')::timestamptz,
      (current_date + 45 + time '23:00')::timestamptz,
      'TESTER Booking - Birthday Party'
    );
  end if;

  select id into tester_invoice_id
  from public.invoices
  where user_id = tester_user_id
    and invoice_number = 'TESTER-INV-001'
  limit 1;

  if tester_invoice_id is null then
    insert into public.invoices (
      user_id,
      client_id,
      booking_id,
      invoice_number,
      status,
      subtotal,
      tax,
      total,
      due_date,
      notes
    )
    values (
      tester_user_id,
      tester_client_id,
      tester_booking_id,
      'TESTER-INV-001',
      'draft',
      300,
      0,
      300,
      current_date + 14,
      'TESTER Invoice - Sample Deposit'
    )
    returning id into tester_invoice_id;
  end if;

  if tester_invoice_id is not null then
    if not exists (
      select 1
      from public.invoice_items
      where user_id = tester_user_id
        and invoice_id = tester_invoice_id
        and description = 'TESTER Invoice Item - Sample Deposit'
    ) then
      insert into public.invoice_items (
        user_id,
        invoice_id,
        description,
        quantity,
        unit_price,
        line_total
      )
      values (
        tester_user_id,
        tester_invoice_id,
        'TESTER Invoice Item - Sample Deposit',
        1,
        300,
        300
      );
    end if;

    if not exists (
      select 1
      from public.payments
      where user_id = tester_user_id
        and invoice_id = tester_invoice_id
        and type = 'deposit'
        and amount = 150
    ) then
      insert into public.payments (
        user_id,
        booking_id,
        invoice_id,
        amount,
        type,
        paid,
        due_date
      )
      values (
        tester_user_id,
        tester_booking_id,
        tester_invoice_id,
        150,
        'deposit',
        false,
        current_date + 14
      );
    end if;
  end if;

  if not exists (
    select 1
    from public.tasks
    where user_id = tester_user_id
      and title = 'TESTER Task - Follow up sample enquiry'
  ) then
    insert into public.tasks (
      user_id,
      title,
      description,
      status,
      priority,
      due_date,
      entity_type,
      entity_id,
      booking_id,
      client_id,
      source
    )
    values (
      tester_user_id,
      'TESTER Task - Follow up sample enquiry',
      'Optional tester seed task. Safe to complete, edit, or delete.',
      'open',
      'normal',
      current_date + 7,
      'booking',
      tester_booking_id,
      tester_booking_id,
      tester_client_id,
      'manual'
    );
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(previous_request_sub, ''), true);

  return 'Tester seed data ensured for tester@djrm.co.';
end;
$$;

comment on function public.seed_tester_crm_data() is
  'Optional tester seed helper. Create tester@djrm.co in Supabase Auth first, then run select public.seed_tester_crm_data();';
