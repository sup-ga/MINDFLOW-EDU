create or replace function private.sync_paid_order_to_new_tutor_prestation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare v_order public.orders%rowtype;
begin
  select o.* into v_order
    from public.tutor_requests r
    join public.orders o on o.id=r.payment_order_id
   where r.id=new.request_id and o.tutor_request_id=r.id
     and o.order_type='tutor_request' and o.status='paid' and o.payment_state='paid';
  if not found then return new; end if;
  update public.tutor_prestations
     set payment_status='paid',
         payment_reference=coalesce(nullif(v_order.ussd_transaction_id,''),nullif(v_order.bill_id,''),v_order.id::text),
         paid_at=coalesce(v_order.paid_at,now()), updated_at=now()
   where id=new.id and payment_status='pending';
  return new;
end;
$$;

drop trigger if exists sync_paid_order_to_new_tutor_prestation on public.tutor_prestations;
create trigger sync_paid_order_to_new_tutor_prestation
after insert on public.tutor_prestations
for each row execute function private.sync_paid_order_to_new_tutor_prestation();

revoke all on function private.sync_paid_order_to_new_tutor_prestation() from public, anon, authenticated;
