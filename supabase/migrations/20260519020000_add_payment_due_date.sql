alter table public.payments
add column if not exists due_date date null;
