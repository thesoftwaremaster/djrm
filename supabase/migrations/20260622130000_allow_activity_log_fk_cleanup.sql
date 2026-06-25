create or replace function public.enforce_crm_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_user_id uuid := auth.uid();
  parent_owner_id uuid;
begin
  if request_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if TG_OP = 'UPDATE'
    and TG_TABLE_NAME = 'activity_logs'
    and NEW.user_id is not distinct from OLD.user_id
    and OLD.booking_id is not null
    and NEW.booking_id is null
    and NEW.client_id is not distinct from OLD.client_id
    and NEW.entity_type is not distinct from OLD.entity_type
    and NEW.entity_id is not distinct from OLD.entity_id
    and NEW.action is not distinct from OLD.action
    and NEW.title is not distinct from OLD.title
    and NEW.description is not distinct from OLD.description
    and NEW.metadata is not distinct from OLD.metadata
    and NEW.created_at is not distinct from OLD.created_at
  then
    return NEW;
  end if;

  if TG_OP = 'INSERT' and NEW.user_id is null then
    NEW.user_id := request_user_id;
  end if;

  if NEW.user_id is distinct from request_user_id then
    raise exception 'CRM row user_id must match the authenticated user';
  end if;

  if TG_OP = 'UPDATE' and NEW.user_id is distinct from OLD.user_id then
    raise exception 'CRM row user_id cannot be changed';
  end if;

  if TG_TABLE_NAME = 'enquiries' then
    select user_id into parent_owner_id from public.clients where id = NEW.client_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Enquiry client belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'bookings' then
    select user_id into parent_owner_id from public.enquiries where id = NEW.enquiry_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Booking enquiry belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'events' then
    select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Event booking belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'invoices' then
    select user_id into parent_owner_id from public.clients where id = NEW.client_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Invoice client belongs to another user';
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Invoice booking belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'invoice_items' then
    select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Invoice item invoice belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'payments' then
    if NEW.invoice_id is not null then
      select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Payment invoice belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Payment booking belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'booking_contracts' then
    select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Contract booking belongs to another user';
    end if;
  elsif TG_TABLE_NAME = 'tasks' then
    if NEW.client_id is not null then
      select user_id into parent_owner_id from public.clients where id = NEW.client_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task client belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task booking belongs to another user';
      end if;
    end if;

    if NEW.invoice_id is not null then
      select user_id into parent_owner_id from public.invoices where id = NEW.invoice_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Task invoice belongs to another user';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'activity_logs' then
    if NEW.client_id is not null then
      select user_id into parent_owner_id from public.clients where id = NEW.client_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Activity client belongs to another user';
      end if;
    end if;

    if NEW.booking_id is not null then
      select user_id into parent_owner_id from public.bookings where id = NEW.booking_id;
      if parent_owner_id is distinct from NEW.user_id then
        raise exception 'Activity booking belongs to another user';
      end if;
    end if;

    if NEW.entity_type = 'client' then
      select user_id into parent_owner_id from public.clients where id = NEW.entity_id;
    elsif NEW.entity_type = 'enquiry' then
      select user_id into parent_owner_id from public.enquiries where id = NEW.entity_id;
    elsif NEW.entity_type = 'booking' then
      select user_id into parent_owner_id from public.bookings where id = NEW.entity_id;
    elsif NEW.entity_type = 'invoice' then
      select user_id into parent_owner_id from public.invoices where id = NEW.entity_id;
    elsif NEW.entity_type = 'payment' then
      select user_id into parent_owner_id from public.payments where id = NEW.entity_id;
    elsif NEW.entity_type = 'booking_contract' then
      select user_id into parent_owner_id from public.booking_contracts where id = NEW.entity_id;
    elsif NEW.entity_type = 'task' then
      select user_id into parent_owner_id from public.tasks where id = NEW.entity_id;
    else
      parent_owner_id := NEW.user_id;
    end if;

    if parent_owner_id is distinct from NEW.user_id then
      raise exception 'Activity entity belongs to another user';
    end if;
  end if;

  return NEW;
end;
$$;
