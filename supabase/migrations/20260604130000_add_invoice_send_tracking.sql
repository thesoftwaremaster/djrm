alter table public.invoices
  add column if not exists invoice_sent_at timestamptz,
  add column if not exists last_sent_at timestamptz;

create index if not exists invoices_user_last_sent_at_idx
on public.invoices (user_id, last_sent_at desc)
where last_sent_at is not null;
