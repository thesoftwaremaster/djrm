alter table public.app_settings
  add column if not exists invoice_footer_text text,
  add column if not exists invoice_thank_you_message text;

create unique index if not exists app_settings_user_id_unique_idx
on public.app_settings (user_id);

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
