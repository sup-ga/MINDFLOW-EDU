-- MindFlow: réservation et synchronisation des cours individuels
alter table public.class_requests
  add column if not exists requested_start_at timestamptz,
  add column if not exists requested_end_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists payment_expires_at timestamptz;

alter table public.class_requests
  drop constraint if exists class_requests_status_check;
alter table public.class_requests
  add constraint class_requests_status_check
  check (status = any (array['pending','accepted','rejected','cancelled','payment_pending','enrolled','expired']::text[]));

update public.class_requests r
set accepted_at = coalesce(r.accepted_at, r.updated_at, r.created_at),
    payment_expires_at = coalesce(r.payment_expires_at, coalesce(r.updated_at, r.created_at) + interval '30 minutes')
from public.professional_offers o
where o.id = r.offer_id and o.offer_type = 'individual'
  and r.status = 'accepted' and r.payment_status <> 'paid';

update public.class_requests
set status = 'expired', updated_at = now()
where status = 'accepted' and payment_status <> 'paid'
  and payment_expires_at is not null and payment_expires_at <= now();

create index if not exists idx_class_requests_individual_schedule
  on public.class_requests (offer_id, requested_start_at, requested_end_at)
  where offer_id is not null;

-- Published class calendars stay locked. Individual offers are different:
-- each accepted/paid learner has their own reservation slot.
create or replace function public.guard_published_class_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_class_id uuid;
  v_offer_id uuid;
  v_offer_status text;
  v_offer_type text;
begin
  if tg_table_name = 'class_sessions' then
    if tg_op = 'UPDATE' then
      if new.class_id is not distinct from old.class_id
         and new.starts_at is not distinct from old.starts_at
         and new.ends_at is not distinct from old.ends_at then
        return new;
      end if;
      select po.status, po.offer_type into v_offer_status, v_offer_type
      from public.professional_classes pc
      join public.professional_offers po on po.id = pc.offer_id
      where pc.id = old.class_id;
      if v_offer_status in ('published', 'archived') and v_offer_type <> 'individual' then
        raise exception 'Le calendrier de cette offre est verrouillé depuis sa publication.'
          using errcode = '55000';
      end if;
      v_class_id := new.class_id;
    elsif tg_op = 'DELETE' then
      v_class_id := old.class_id;
    else
      v_class_id := new.class_id;
    end if;
    select pc.offer_id into v_offer_id
    from public.professional_classes pc
    where pc.id = v_class_id;
  else
    if tg_op = 'UPDATE' then
      if new.offer_id is not distinct from old.offer_id
         and new.start_at is not distinct from old.start_at
         and new.end_at is not distinct from old.end_at then
        return new;
      end if;
      select status, offer_type into v_offer_status, v_offer_type
      from public.professional_offers
      where id = old.offer_id;
      if v_offer_status in ('published', 'archived') and v_offer_type <> 'individual' then
        raise exception 'Le calendrier de cette offre est verrouillé depuis sa publication.'
          using errcode = '55000';
      end if;
      v_offer_id := new.offer_id;
    elsif tg_op = 'DELETE' then
      v_offer_id := old.offer_id;
    else
      v_offer_id := new.offer_id;
    end if;
  end if;

  if v_offer_id is not null then
    select status, offer_type into v_offer_status, v_offer_type
    from public.professional_offers
    where id = v_offer_id;
    if v_offer_status in ('published', 'archived') and v_offer_type <> 'individual' then
      raise exception 'Le calendrier de cette offre est verrouillé depuis sa publication.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.prepare_individual_lesson_acceptance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_professional_id uuid;
  v_offer_type text;
  v_offer_title text;
  v_duration_minutes integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.offer_id is not null then
    select professional_id, offer_type, title
      into v_professional_id, v_offer_type, v_offer_title
    from public.professional_offers
    where id = new.offer_id;

    if v_offer_type = 'individual' then
      if new.requested_hours is null or new.requested_hours < 1
         or new.requested_start_at is null or new.requested_end_at is null then
        raise exception 'Cette demande individuelle doit contenir une date, une heure de début et une heure de fin.'
          using errcode = '23514';
      end if;

      v_duration_minutes := extract(epoch from (new.requested_end_at - new.requested_start_at))::integer / 60;
      if new.requested_start_at <= now()
         or new.requested_end_at <= new.requested_start_at
         or v_duration_minutes <> new.requested_hours * 60 then
        raise exception 'Le créneau doit être futur et sa durée doit correspondre exactement au nombre d’heures demandé.'
          using errcode = '23514';
      end if;

      perform pg_advisory_xact_lock(hashtextextended(v_professional_id::text, 0));

      if exists (
        select 1
        from public.class_sessions cs
        join public.professional_classes pc on pc.id = cs.class_id
        where pc.professional_id = v_professional_id
          and cs.status <> 'cancelled'
          and cs.ends_at > now()
          and tstzrange(cs.starts_at, cs.ends_at, '[)') &&
              tstzrange(new.requested_start_at, new.requested_end_at, '[)')
      ) then
        raise exception 'Ce créneau chevauche déjà une séance de ton emploi du temps.'
          using errcode = '23P01';
      end if;

      if exists (
        select 1
        from public.class_requests other_request
        join public.professional_offers other_offer on other_offer.id = other_request.offer_id
        where other_offer.professional_id = v_professional_id
          and other_request.id <> new.id
          and other_request.requested_start_at is not null
          and other_request.requested_end_at is not null
          and (
            (other_request.status in ('accepted','payment_pending')
              and other_request.payment_expires_at > now())
            or (other_request.status = 'enrolled' and other_request.payment_status = 'paid')
          )
          and tstzrange(other_request.requested_start_at, other_request.requested_end_at, '[)') &&
              tstzrange(new.requested_start_at, new.requested_end_at, '[)')
      ) then
        raise exception 'Un autre apprenant possède déjà ce créneau ou attend son paiement.'
          using errcode = '23P01';
      end if;

      new.accepted_at := now();
      new.payment_expires_at := now() + interval '30 minutes';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_individual_lesson_acceptance on public.class_requests;
create trigger trg_prepare_individual_lesson_acceptance
before update of status on public.class_requests
for each row execute function private.prepare_individual_lesson_acceptance();

create or replace function private.sync_paid_individual_lesson_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_offer public.professional_offers%rowtype;
  v_class_id uuid;
  v_session_title text;
begin
  if new.status <> 'enrolled' or new.payment_status <> 'paid'
     or new.class_id is not null or new.offer_id is null then
    return new;
  end if;

  select * into v_offer
  from public.professional_offers
  where id = new.offer_id and offer_type = 'individual';

  if not found then return new; end if;

  if new.requested_start_at is null or new.requested_end_at is null
     or new.requested_end_at <= new.requested_start_at then
    raise exception 'Le créneau du cours individuel est incomplet. Le paiement doit être vérifié par MindFlow.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_offer.professional_id::text, 0));

  if exists (
    select 1
    from public.class_sessions cs
    join public.professional_classes pc on pc.id = cs.class_id
    where pc.professional_id = v_offer.professional_id
      and cs.status <> 'cancelled'
      and cs.ends_at > now()
      and tstzrange(cs.starts_at, cs.ends_at, '[)') &&
          tstzrange(new.requested_start_at, new.requested_end_at, '[)')
  ) then
    raise exception 'Le créneau est désormais indisponible. Le paiement doit être régularisé par MindFlow.'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.class_requests other_request
    join public.professional_offers other_offer on other_offer.id = other_request.offer_id
    where other_offer.professional_id = v_offer.professional_id
      and other_request.id <> new.id
      and other_request.requested_start_at is not null
      and other_request.requested_end_at is not null
      and (
        (other_request.status in ('accepted','payment_pending')
          and other_request.payment_expires_at > now())
        or (other_request.status = 'enrolled' and other_request.payment_status = 'paid')
      )
      and tstzrange(other_request.requested_start_at, other_request.requested_end_at, '[)') &&
          tstzrange(new.requested_start_at, new.requested_end_at, '[)')
  ) then
    raise exception 'Le créneau est désormais réservé à un autre apprenant. Le paiement doit être régularisé par MindFlow.'
      using errcode = '23P01';
  end if;

  v_session_title := coalesce(nullif(v_offer.title, ''), 'Cours individuel');
  insert into public.professional_classes
    (offer_id, professional_id, title, description, start_at, end_at, status)
  values
    (v_offer.id, v_offer.professional_id, v_session_title, coalesce(v_offer.description, ''),
     new.requested_start_at, new.requested_end_at, 'planned')
  returning id into v_class_id;

  insert into public.class_sessions
    (class_id, title, description, starts_at, ends_at, status)
  values
    (v_class_id, v_session_title, coalesce(v_offer.description, ''),
     new.requested_start_at, new.requested_end_at, 'scheduled');

  update public.class_requests
  set class_id = v_class_id, updated_at = now()
  where id = new.id and class_id is null;

  insert into public.class_enrollments (class_id, learner_id, request_id, status)
  values (v_class_id, new.learner_id, new.id, 'active')
  on conflict (class_id, learner_id)
  do update set request_id = excluded.request_id, status = 'active';

  insert into public.professional_notifications
    (professional_user_id, title, body)
  values
    (v_offer.professional_id, 'Cours individuel confirmé',
     'Le paiement a été confirmé. Une séance individuelle a été ajoutée automatiquement à ton emploi du temps.');

  return new;
end;
$$;

revoke all on function private.prepare_individual_lesson_acceptance() from public, anon, authenticated;
revoke all on function private.sync_paid_individual_lesson_schedule() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'mindflow-expire-individual-lesson-requests';

select cron.schedule(
  'mindflow-expire-individual-lesson-requests',
  '* * * * *',
  $job$
    update public.class_requests r
       set status = 'expired', updated_at = now()
     where r.status = 'accepted'
       and r.payment_status <> 'paid'
       and r.payment_expires_at is not null
       and r.payment_expires_at <= now()
       and not exists (
         select 1 from public.orders o
          where o.class_request_id = r.id
            and o.status = 'pending'
            and o.created_at <= r.payment_expires_at
            and o.created_at > now() - interval '30 minutes'
       );
  $job$
);
