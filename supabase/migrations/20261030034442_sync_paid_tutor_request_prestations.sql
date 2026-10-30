-- Allow trusted database-owned trigger functions to synchronize a confirmed payment.
create or replace function private.guard_tutor_prestation_financial_updates()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from 'paid'
     and coalesce(jwt_role, '') <> 'service_role'
     and current_user <> 'postgres' then
    raise exception 'Le paiement doit être confirmé par une notification serveur de MindFlow.';
  end if;
  if new.payout_status = 'paid'
     and old.payout_status is distinct from 'paid'
     and old.payout_status <> 'eligible' then
    raise exception 'La rémunération ne peut être marquée versée que lorsque toutes les conditions sont réunies.';
  end if;
  return new;
end;
$$;

create or replace function private.sync_paid_tutor_request_order()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
begin
  if new.order_type <> 'tutor_request' or new.tutor_request_id is null
     or new.status <> 'paid' or new.payment_state <> 'paid' then return new; end if;
  update public.tutor_requests
     set status='paid', payment_order_id=new.id, admin_updated_at=now(), updated_at=now()
   where id=new.tutor_request_id
     and (status is distinct from 'paid' or payment_order_id is distinct from new.id);
  return new;
end;
$$;

create or replace function private.sync_paid_tutor_request_prestation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare v_order public.orders%rowtype; v_prestation_id uuid;
begin
  if new.status <> 'paid' or new.payment_order_id is null then return new; end if;
  select * into v_order from public.orders
   where id=new.payment_order_id and tutor_request_id=new.id
     and order_type='tutor_request' and status='paid' and payment_state='paid';
  if not found then return new; end if;
  select id into v_prestation_id from public.tutor_prestations
   where request_id=new.id and payment_status='pending' and status='awaiting_payment'
   order by created_at desc limit 1 for update;
  if v_prestation_id is null then return new; end if;
  update public.tutor_prestations
     set payment_status='paid',
         payment_reference=coalesce(nullif(v_order.ussd_transaction_id,''),nullif(v_order.bill_id,''),v_order.id::text),
         paid_at=coalesce(v_order.paid_at,now()), updated_at=now()
   where id=v_prestation_id;
  return new;
end;
$$;

drop trigger if exists sync_paid_tutor_request_order on public.orders;
create trigger sync_paid_tutor_request_order
after insert or update of status, payment_state, tutor_request_id on public.orders
for each row execute function private.sync_paid_tutor_request_order();

drop trigger if exists sync_paid_tutor_request_prestation on public.tutor_requests;
create trigger sync_paid_tutor_request_prestation
after update of status, payment_order_id on public.tutor_requests
for each row when (new.status='paid')
execute function private.sync_paid_tutor_request_prestation();

update public.tutor_prestations tp
   set payment_status='paid',
       payment_reference=coalesce(nullif(o.ussd_transaction_id,''),nullif(o.bill_id,''),o.id::text),
       paid_at=coalesce(o.paid_at,now()), updated_at=now()
  from public.tutor_requests tr
  join public.orders o on o.id=tr.payment_order_id and o.tutor_request_id=tr.id
   and o.order_type='tutor_request' and o.status='paid' and o.payment_state='paid'
 where tp.request_id=tr.id and tr.status='paid'
   and tp.status='awaiting_payment' and tp.payment_status='pending' and tp.archived_at is null;

revoke all on function private.sync_paid_tutor_request_order() from public, anon, authenticated;
revoke all on function private.sync_paid_tutor_request_prestation() from public, anon, authenticated;
