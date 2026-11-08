create or replace function private.guard_class_session_conflicts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_professional_id uuid;
  v_ignore_session_id uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.status = 'cancelled' then return new; end if;
  if tg_op = 'UPDATE'
     and new.class_id is not distinct from old.class_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;
  select professional_id into v_professional_id
  from public.professional_classes where id = new.class_id;
  if v_professional_id is null then return new; end if;
  if tg_op = 'UPDATE' then v_ignore_session_id := old.id; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_professional_id::text, 0));
  if exists (
    select 1 from public.class_sessions existing
    join public.professional_classes pc on pc.id = existing.class_id
    where pc.professional_id = v_professional_id and existing.status <> 'cancelled'
      and existing.ends_at > now() and existing.id is distinct from v_ignore_session_id
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
revoke all on function private.guard_class_session_conflicts() from public, anon, authenticated;