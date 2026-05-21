-- Internal trusted-user RLS baseline.
--
-- This CRM currently has no user/account/tenant ownership columns, so these
-- policies intentionally allow any authenticated Supabase user to work with
-- all CRM data. Keep public signup disabled or otherwise restricted.
--
-- Frontend route protection is UX only; these policies are the database gate.

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
    'payments'
  ];
begin
  revoke all on all sequences in schema public from anon;
  grant usage, select on all sequences in schema public to authenticated;

  foreach crm_table in array crm_tables
  loop
    execute format('alter table public.%I enable row level security', crm_table);

    -- Remove stale policies first so anon cannot retain access through an
    -- older permissive policy on one of these browser-accessed CRM tables.
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = crm_table
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
      'create policy %I on public.%I for select to authenticated using (auth.role() = ''authenticated'')',
      crm_table || '_authenticated_select',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.role() = ''authenticated'')',
      crm_table || '_authenticated_insert',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      crm_table || '_authenticated_update',
      crm_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.role() = ''authenticated'')',
      crm_table || '_authenticated_delete',
      crm_table
    );
  end loop;
end $$;
