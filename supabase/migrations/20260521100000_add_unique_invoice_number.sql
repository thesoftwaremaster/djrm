create unique index if not exists invoices_invoice_number_unique
on public.invoices (invoice_number)
where invoice_number is not null;
