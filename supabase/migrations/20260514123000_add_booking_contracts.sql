create extension if not exists pgcrypto;

create table if not exists public.booking_contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  status text not null default 'signed',
  uploaded_at timestamptz not null default now(),
  constraint booking_contracts_status_check check (status in ('signed'))
);

create unique index if not exists booking_contracts_booking_id_key
on public.booking_contracts (booking_id);

alter table public.booking_contracts enable row level security;

revoke all on table public.booking_contracts from anon;
grant select, insert, update, delete on table public.booking_contracts to authenticated;

drop policy if exists booking_contracts_authenticated_select on public.booking_contracts;
drop policy if exists booking_contracts_authenticated_insert on public.booking_contracts;
drop policy if exists booking_contracts_authenticated_update on public.booking_contracts;
drop policy if exists booking_contracts_authenticated_delete on public.booking_contracts;

create policy booking_contracts_authenticated_select
on public.booking_contracts
for select
to authenticated
using (auth.role() = 'authenticated');

create policy booking_contracts_authenticated_insert
on public.booking_contracts
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy booking_contracts_authenticated_update
on public.booking_contracts
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy booking_contracts_authenticated_delete
on public.booking_contracts
for delete
to authenticated
using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do update
set public = false;

drop policy if exists contracts_authenticated_select on storage.objects;
drop policy if exists contracts_authenticated_insert on storage.objects;
drop policy if exists contracts_authenticated_update on storage.objects;
drop policy if exists contracts_authenticated_delete on storage.objects;

create policy contracts_authenticated_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'contracts'
  and auth.role() = 'authenticated'
);

create policy contracts_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'contracts'
  and auth.role() = 'authenticated'
);

create policy contracts_authenticated_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'contracts'
  and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'contracts'
  and auth.role() = 'authenticated'
);

create policy contracts_authenticated_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'contracts'
  and auth.role() = 'authenticated'
);
