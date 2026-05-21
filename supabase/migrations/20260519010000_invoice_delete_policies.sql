-- Repair invoice deletion permissions without disabling RLS.
-- Draft invoice deletion removes unpaid payment placeholders and invoice_items
-- explicitly in the browser workflow before deleting the invoice.

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
