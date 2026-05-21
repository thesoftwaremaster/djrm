create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text default 'open',
  priority text default 'normal',
  due_date date,
  entity_type text,
  entity_id uuid,
  booking_id uuid,
  client_id uuid,
  invoice_id uuid,
  source text default 'manual',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists tasks_generated_source_entity_key
on public.tasks (source, entity_type, entity_id)
where source <> 'manual' and entity_type is not null and entity_id is not null;

alter table public.tasks enable row level security;

revoke all on table public.tasks from anon;
grant select, insert, update, delete on table public.tasks to authenticated;

drop policy if exists tasks_authenticated_select on public.tasks;
drop policy if exists tasks_authenticated_insert on public.tasks;
drop policy if exists tasks_authenticated_update on public.tasks;
drop policy if exists tasks_authenticated_delete on public.tasks;

create policy tasks_authenticated_select
on public.tasks
for select
to authenticated
using (auth.role() = 'authenticated');

create policy tasks_authenticated_insert
on public.tasks
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy tasks_authenticated_update
on public.tasks
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy tasks_authenticated_delete
on public.tasks
for delete
to authenticated
using (auth.role() = 'authenticated');
