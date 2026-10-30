-- MindFlow Réseau: separate reviewer roster and protected application review
create table if not exists public.network_admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.network_admin_members enable row level security;
revoke all on table public.network_admin_members from anon, authenticated;

create or replace function public.is_network_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.network_admin_members m
    where m.user_id = (select auth.uid())
      and m.is_active = true
  );
$$;
revoke all on function public.is_network_reviewer() from public, anon;
grant execute on function public.is_network_reviewer() to authenticated;

grant select, update on table public.organization_applications to authenticated;
drop policy if exists "Network reviewers can read organization applications" on public.organization_applications;
create policy "Network reviewers can read organization applications"
on public.organization_applications for select to authenticated
using ((select public.is_network_reviewer()));
drop policy if exists "Network reviewers can update organization applications" on public.organization_applications;
create policy "Network reviewers can update organization applications"
on public.organization_applications for update to authenticated
using ((select public.is_network_reviewer()))
with check ((select public.is_network_reviewer()));
