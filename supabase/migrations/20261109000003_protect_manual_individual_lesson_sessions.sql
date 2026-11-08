-- Permit manual scheduling on published offers that do not have a fixed calendar.
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
  v_schedule_first_start_at timestamptz;
begin
  if tg_table_name = 'class_sessions' then
    if tg_op = 'UPDATE' then
      if new.class_id is not distinct from old.class_id
         and new.starts_at is not distinct from old.starts_at
         and new.ends_at is not distinct from old.ends_at then return new; end if;
      select po.status, po.offer_type, po.schedule_first_start_at
        into v_offer_status, v_offer_type, v_schedule_first_start_at
      from public.professional_classes pc
      join public.professional_offers po on po.id = pc.offer_id
      where pc.id = old.class_id;
      if v_offer_status = 'archived'
         or (v_offer_status = 'published' and v_offer_type <> 'individual' and v_schedule_first_start_at is not null) then
        raise exception 'Le calendrier fixe de cette offre est verrouillé depuis sa publication.'
          using errcode = '55000';
      end if;
      v_class_id := new.class_id;
    elsif tg_op = 'DELETE' then v_class_id := old.class_id;
    else v_class_id := new.class_id;
    end if;
    select pc.offer_id into v_offer_id from public.professional_classes pc where pc.id = v_class_id;
  else
    if tg_op = 'UPDATE' then
      if new.offer_id is not distinct from old.offer_id
         and new.start_at is not distinct from old.start_at
         and new.end_at is not distinct from old.end_at then return new; end if;
      select status, offer_type, schedule_first_start_at
        into v_offer_status, v_offer_type, v_schedule_first_start_at
      from public.professional_offers where id = old.offer_id;
      if v_offer_status = 'archived'
         or (v_offer_status = 'published' and v_offer_type <> 'individual' and v_schedule_first_start_at is not null) then
        raise exception 'Le calendrier fixe de cette offre est verrouillé depuis sa publication.'
          using errcode = '55000';
      end if;
      v_offer_id := new.offer_id;
    elsif tg_op = 'DELETE' then v_offer_id := old.offer_id;
    else v_offer_id := new.offer_id;
    end if;
  end if;
  if v_offer_id is not null then
    select status, offer_type, schedule_first_start_at
      into v_offer_status, v_offer_type, v_schedule_first_start_at
    from public.professional_offers where id = v_offer_id;
    if v_offer_status = 'archived'
       or (v_offer_status = 'published' and v_offer_type <> 'individual' and v_schedule_first_start_at is not null) then
      raise exception 'Le calendrier fixe de cette offre est verrouillé depuis sa publication.'
        using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_class_session_conflicts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_professional_id uuid;
begin
  if tg_op = 'DELETE' or new.status = 'cancelled' then return coalesce(new, old); end if;
  select professional_id into v_professional_id from public.professional_classes where id = new.class_id;
  if v_professional_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_professional_id::text, 0));
  if exists (
    select 1 from public.class_sessions existing
    join public.professional_classes pc on pc.id = existing.class_id
    where pc.professional_id = v_professional_id and existing.status <> 'cancelled'
      and existing.ends_at > now()
      and existing.id <> case when tg_op = 'UPDATE' then old.id else '00000000-0000-0000-0000-000000000000'::uuid end
      and tstzrange(existing.starts_at, existing.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then raise exception 'Cette séance chevauche déjà une autre séance de ton emploi du temps.' using errcode = '23P01'; end if;
  if exists (
    select 1 from public.class_requests r
    join public.professional_offers o on o.id = r.offer_id
    where o.professional_id = v_professional_id and r.status in ('accepted','payment_pending')
      and r.payment_expires_at > now() and r.requested_start_at is not null and r.requested_end_at is not null
      and tstzrange(r.requested_start_at, r.requested_end_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then raise exception 'Cette séance chevauche une demande individuelle acceptée dont le paiement est encore attendu.' using errcode = '23P01'; end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_class_session_conflicts on public.class_sessions;
create trigger trg_guard_class_session_conflicts before insert or update on public.class_sessions
for each row execute function private.guard_class_session_conflicts();
revoke all on function private.guard_class_session_conflicts() from public, anon, authenticated;