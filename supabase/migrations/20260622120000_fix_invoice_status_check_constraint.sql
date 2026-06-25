alter table public.invoices
drop constraint if exists invoices_status_check;

update public.invoices
set status = 'part_paid'
where status = 'partially_paid';

alter table public.invoices
add constraint invoices_status_check
check (
  status in (
    'draft',
    'sent',
    'part_paid',
    'paid',
    'overdue',
    'cancelled'
  )
);
