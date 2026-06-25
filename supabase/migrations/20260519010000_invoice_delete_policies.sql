-- Repair deletion permissions without disabling RLS.
-- Invoice deletion must be guarded in the browser workflow; linked payments
-- are removed only after the user confirms the invoice/payment warning.

alter table public.payments enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoices enable row level security;

grant delete on table public.payments to authenticated;
grant delete on table public.invoice_items to authenticated;
grant delete on table public.invoices to authenticated;

drop policy if exists payments_authenticated_delete on public.payments;
create policy payments_authenticated_delete
on public.payments
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists invoice_items_authenticated_delete on public.invoice_items;
create policy invoice_items_authenticated_delete
on public.invoice_items
for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists invoices_authenticated_delete on public.invoices;
create policy invoices_authenticated_delete
on public.invoices
for delete
to authenticated
using (auth.role() = 'authenticated');
