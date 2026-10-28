create policy "Learners read sessions for paid offer requests"
  on public.class_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.professional_classes c
      join public.class_requests r on r.offer_id = c.offer_id
      where c.id = class_sessions.class_id
        and r.learner_id = auth.uid()
        and r.payment_status = 'paid'
        and r.status in ('accepted', 'enrolled')
    )
  );
