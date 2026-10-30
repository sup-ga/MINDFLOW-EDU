-- MindFlow Réseau: public partner application intake
create table if not exists public.organization_applications (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 160),
  organization_type text not null check (organization_type in ('Établissement scolaire','Université / grande école','Centre de formation','Association / ONG','Entreprise','Autre')),
  activity_domain text not null check (char_length(trim(activity_domain)) between 2 and 160),
  presentation text not null check (char_length(trim(presentation)) between 20 and 1800),
  representative_name text not null check (char_length(trim(representative_name)) between 2 and 120),
  representative_role text not null check (char_length(trim(representative_role)) between 2 and 120),
  contact_email text not null check (char_length(trim(contact_email)) between 5 and 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  country text not null check (char_length(trim(country)) between 2 and 100),
  city text check (city is null or char_length(city) <= 120),
  collaboration_types text[] not null default '{}',
  collaboration_message text check (collaboration_message is null or char_length(collaboration_message) <= 1200),
  status text not null default 'pending' check (status in ('pending','under_review','approved','rejected','needs_information','suspended')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.organization_applications enable row level security;
revoke all on table public.organization_applications from anon, authenticated;
grant insert on table public.organization_applications to anon, authenticated;
create policy "Public can submit organization applications"
on public.organization_applications for insert to anon, authenticated
with check (status = 'pending' and admin_note is null and reviewed_at is null and cardinality(collaboration_types) <= 8);
