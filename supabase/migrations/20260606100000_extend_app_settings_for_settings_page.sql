alter table public.app_settings
  add column if not exists contact_name text,
  add column if not exists business_description text,
  add column if not exists payment_terms_days integer default 7,
  add column if not exists tax_enabled boolean default false,
  add column if not exists tax_rate numeric default 0,
  add column if not exists bank_details text,
  add column if not exists payment_instructions text,
  add column if not exists invoice_footer_note text,
  add column if not exists default_event_duration numeric default 5,
  add column if not exists default_setup_time numeric default 1,
  add column if not exists default_travel_fee numeric default 0,
  add column if not exists cancellation_policy text,
  add column if not exists default_terms text,
  add column if not exists email_reminders_enabled boolean default true,
  add column if not exists payment_reminder_days integer default 3,
  add column if not exists event_reminder_days integer default 7,
  add column if not exists follow_up_reminder_days integer default 2,
  add column if not exists weekly_summary_enabled boolean default false,
  add column if not exists accent_colour text default '#111827',
  add column if not exists dark_mode_enabled boolean default false,
  add column if not exists pdf_style text default 'Modern',
  add column if not exists full_name text,
  add column if not exists timezone text default 'Europe/London';

update public.app_settings
set
  payment_terms_days = coalesce(payment_terms_days, default_due_days, 7),
  tax_rate = coalesce(tax_rate, default_tax_rate, 0),
  default_event_duration = coalesce(default_event_duration, default_event_duration_hours, 5),
  bank_details = coalesce(
    bank_details,
    nullif(
      concat_ws(
        E'\n',
        nullif(bank_name, ''),
        nullif(bank_account_name, ''),
        case when nullif(bank_sort_code, '') is not null then 'Sort code: ' || bank_sort_code end,
        case when nullif(bank_account_number, '') is not null then 'Account: ' || bank_account_number end,
        case when nullif(iban, '') is not null then 'IBAN: ' || iban end,
        case when nullif(bic_swift, '') is not null then 'BIC/SWIFT: ' || bic_swift end
      ),
      ''
    )
  ),
  payment_instructions = coalesce(payment_instructions, payment_reference_instructions),
  invoice_footer_note = coalesce(invoice_footer_note, invoice_footer_text),
  timezone = coalesce(timezone, 'Europe/London')
where true;

create or replace function public.set_app_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.set_app_settings_updated_at();

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
