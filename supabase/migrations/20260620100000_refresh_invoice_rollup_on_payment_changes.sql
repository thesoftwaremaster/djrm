drop trigger if exists payments_refresh_invoice_rollup_trigger on public.payments;
drop function if exists public.refresh_invoice_rollup_from_payment_change();

create or replace function public.refresh_invoice_rollup_from_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.invoice_id is not null then
      perform public.refresh_invoice_payment_rollup(new.invoice_id);
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.invoice_id is not null then
      perform public.refresh_invoice_payment_rollup(new.invoice_id);
    end if;

    if old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
      perform public.refresh_invoice_payment_rollup(old.invoice_id);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.invoice_id is not null then
      perform public.refresh_invoice_payment_rollup(old.invoice_id);
    end if;

    return old;
  end if;

  return null;
end;
$$;

create trigger payments_refresh_invoice_rollup_trigger
after insert or update or delete on public.payments
for each row
execute function public.refresh_invoice_rollup_from_payment_change();
