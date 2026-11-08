create or replace function private.sync_paid_individual_lesson_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_offer public.professional_offers%rowtype;
  v_professional_user_id uuid;
  v_class_id uuid;
  v_session_title text;
begin
  if new.status <> 'enrolled' or new.payment_status <> 'paid'
     or new.class_id is not null or new.offer_id is null then return new; end if;
  select * into v_offer from public.professional_offers
   where id = new.offer_id and offer_type = 'individual';
  if not found then return new; end if;
  if new.requested_start_at is null or new.requested_end_at is null
     or new.requested_end_at <= new.requested_start_at then
    raise exception 'Le créneau du cours individuel est incomplet. Le paiement doit être vérifié par MindFlow.'
      using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_offer.professional_id::text, 0));
  if exists (
    select 1 from public.class_sessions cs
    join public.professional_classes pc on pc.id = cs.class_id
    where pc.professional_id = v_offer.professional_id and cs.status <> 'cancelled'
      and cs.ends_at > now()
      and tstzrange(cs.starts_at, cs.ends_at, '[)') &&
          tstzrange(new.requested_start_at, new.requested_end_at, '[)')
  ) then
    raise exception 'Le créneau est désormais indisponible. Le paiement doit être régularisé par MindFlow.'
      using errcode = '23P01';
  end if;
  if exists (
    select 1 from public.class_requests other_request
    join public.professional_offers other_offer on other_offer.id = other_request.offer_id
    where other_offer.professional_id = v_offer.professional_id and other_request.id <> new.id
      and other_request.requested_start_at is not null and other_request.requested_end_at is not null
      and ((other_request.status in ('accepted','payment_pending') and other_request.payment_expires_at > now())
        or (other_request.status = 'enrolled' and other_request.payment_status = 'paid'))
      and tstzrange(other_request.requested_start_at, other_request.requested_end_at, '[)') &&
          tstzrange(new.requested_start_at, new.requested_end_at, '[)')
  ) then
    raise exception 'Le créneau est désormais réservé à un autre apprenant. Le paiement doit être régularisé par MindFlow.'
      using errcode = '23P01';
  end if;
  v_session_title := coalesce(nullif(v_offer.title, ''), 'Cours individuel');
  insert into public.professional_classes
    (offer_id, professional_id, title, description, start_at, end_at, status)
  values (v_offer.id, v_offer.professional_id, v_session_title, coalesce(v_offer.description, ''),
          new.requested_start_at, new.requested_end_at, 'planned')
  returning id into v_class_id;
  insert into public.class_sessions (class_id, title, description, starts_at, ends_at, status)
  values (v_class_id, v_session_title, coalesce(v_offer.description, ''),
          new.requested_start_at, new.requested_end_at, 'scheduled');
  update public.class_requests set class_id = v_class_id, updated_at = now()
   where id = new.id and class_id is null;
  insert into public.class_enrollments (class_id, learner_id, request_id, status)
  values (v_class_id, new.learner_id, new.id, 'active')
  on conflict (class_id, learner_id)
  do update set request_id = excluded.request_id, status = 'active';
  select user_id into v_professional_user_id from public.professional_profiles
   where id = v_offer.professional_id;
  if v_professional_user_id is not null then
    insert into public.professional_notifications (professional_user_id, title, body)
    values (v_professional_user_id, 'Cours individuel confirmé',
      'Le paiement a été confirmé. Une séance individuelle a été ajoutée automatiquement à ton emploi du temps.');
  end if;
  return new;
end;
$$;
revoke all on function private.sync_paid_individual_lesson_schedule() from public, anon, authenticated;
