alter table public.events
add column if not exists created_at timestamptz not null default now();
