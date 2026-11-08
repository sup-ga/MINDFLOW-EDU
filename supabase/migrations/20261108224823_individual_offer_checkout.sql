alter table public.class_requests
  add column if not exists requested_hours integer;

alter table public.class_requests
  drop constraint if exists class_requests_requested_hours_check;
alter table public.class_requests
  add constraint class_requests_requested_hours_check
  check (requested_hours is null or requested_hours between 1 and 100);

alter table public.orders
  add column if not exists class_request_id uuid;

alter table public.orders
  drop constraint if exists orders_class_request_id_fkey;
alter table public.orders
  add constraint orders_class_request_id_fkey
  foreign key (class_request_id)
  references public.class_requests(id)
  on delete set null;

alter table public.orders
  drop constraint if exists orders_class_request_offer_consistency;
alter table public.orders
  add constraint orders_class_request_offer_consistency
  check (class_request_id is null or (offer_id is not null and order_type = 'offer'));

create index if not exists idx_orders_class_request_id
  on public.orders(class_request_id);

create unique index if not exists uq_orders_pending_class_request
  on public.orders(class_request_id)
  where class_request_id is not null and status = 'pending';