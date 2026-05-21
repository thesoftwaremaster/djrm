create extension if not exists pgcrypto;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  booking_id uuid references public.bookings(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  action text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_booking_id_created_at_idx
on public.activity_logs (booking_id, created_at desc);

create index if not exists activity_logs_entity_idx
on public.activity_logs (entity_type, entity_id, created_at desc);

alter table public.activity_logs enable row level security;

revoke all on table public.activity_logs from anon;
grant select, insert, update, delete on table public.activity_logs to authenticated;

drop policy if exists activity_logs_authenticated_select on public.activity_logs;
drop policy if exists activity_logs_authenticated_insert on public.activity_logs;
drop policy if exists activity_logs_authenticated_update on public.activity_logs;
drop policy if exists activity_logs_authenticated_delete on public.activity_logs;

create policy activity_logs_authenticated_select
on public.activity_logs
for select
to authenticated
using (auth.role() = 'authenticated');

create policy activity_logs_authenticated_insert
on public.activity_logs
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy activity_logs_authenticated_update
on public.activity_logs
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy activity_logs_authenticated_delete
on public.activity_logs
for delete
to authenticated
using (auth.role() = 'authenticated');
