alter table public.professional_offers
  add column if not exists availability_notes text not null default '';
