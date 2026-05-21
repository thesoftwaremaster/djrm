alter table public.invoices
  add column if not exists currency text default 'GBP';
