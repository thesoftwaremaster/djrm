create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_name text,
  display_name text,
  contact_email text,
  phone text,
  website text,
  address text,
  invoice_prefix text default 'INV',
  next_invoice_number integer,
  default_due_days integer default 14,
  currency text default 'GBP',
  default_tax_rate numeric default 0,
  payment_link_placeholder text,
  default_deposit_percentage numeric default 50,
  default_booking_status text default 'pending',
  default_event_duration_hours numeric,
  require_contract_by_default boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint app_settings_user_id_unique unique (user_id)
);

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from anon;
grant select, insert, update on table public.app_settings to authenticated;

drop policy if exists app_settings_authenticated_select on public.app_settings;
drop policy if exists app_settings_authenticated_insert on public.app_settings;
drop policy if exists app_settings_authenticated_update on public.app_settings;

create policy app_settings_authenticated_select
on public.app_settings
for select
to authenticated
using (user_id = auth.uid());

create policy app_settings_authenticated_insert
on public.app_settings
for insert
to authenticated
with check (user_id = auth.uid());

create policy app_settings_authenticated_update
on public.app_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
