do $$
declare
  protected_table text;
  protected_tables text[] := array[
    'clients',
    'enquiries',
    'bookings',
    'events',
    'invoices',
    'invoice_items',
    'payments',
    'booking_contracts',
    'activity_logs',
    'tasks'
  ];
begin
  foreach protected_table in array protected_tables
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      protected_table || '_demo_no_delete',
      protected_table
    );

    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (coalesce(auth.jwt() ->> ''email'', '''') <> ''demo@djrm.co'')',
      protected_table || '_demo_no_delete',
      protected_table
    );
  end loop;
end $$;

drop policy if exists contracts_demo_no_delete on storage.objects;

create policy contracts_demo_no_delete
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id <> 'contracts'
  or coalesce(auth.jwt() ->> 'email', '') <> 'demo@djrm.co'
);
