alter table public.app_settings
  add column if not exists bank_account_name text,
  add column if not exists bank_name text,
  add column if not exists bank_sort_code text,
  add column if not exists bank_account_number text,
  add column if not exists iban text,
  add column if not exists bic_swift text,
  add column if not exists payment_reference_instructions text,
  add column if not exists payment_link_url text;

alter table public.app_settings enable row level security;
