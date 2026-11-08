drop policy if exists "Professionals delete resolved requests" on public.class_requests;
create policy "Professionals delete resolved requests"
on public.class_requests
for delete
to authenticated
using (
  status = any (array['accepted','rejected','cancelled','enrolled','expired']::text[])
  and (
    exists (
      select 1
      from public.professional_classes c
      join public.professional_profiles p on p.id = c.professional_id
      where c.id = class_requests.class_id
        and p.user_id = (select auth.uid())
        and p.status = 'approved'
    )
    or exists (
      select 1
      from public.professional_offers o
      join public.professional_profiles p on p.id = o.professional_id
      where o.id = class_requests.offer_id
        and p.user_id = (select auth.uid())
        and p.status = 'approved'
    )
  )
);