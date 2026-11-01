-- Lock class and session dates once an offer has been published.
create or replace function public.guard_published_class_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_class_id uuid;
  v_offer_id uuid;
  v_offer_status text;
begin
  if tg_table_name = 'class_sessions' then
    if tg_op = 'UPDATE' then
      if new.class_id is not distinct from old.class_id
         and new.starts_at is not distinct from old.starts_at
         and new.ends_at is not distinct from old.ends_at then
        return new;
      end if;
      select po.status into v_offer_status
      from public.professional_classes pc
      join public.professional_offers po on po.id = pc.offer_id
      where pc.id = old.class_id;
      if v_offer_status in ('published', 'archived') then
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
      select status into v_offer_status
      from public.professional_offers
      where id = old.offer_id;
      if v_offer_status in ('published', 'archived') then
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
    select po.status into v_offer_status
    from public.professional_offers po
    where po.id = v_offer_id;
    if v_offer_status in ('published', 'archived') then
      raise exception 'Le calendrier de cette offre est verrouillé depuis sa publication.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_published_class_session_schedule on public.class_sessions;
create trigger trg_guard_published_class_session_schedule
before insert or update or delete on public.class_sessions
for each row execute function public.guard_published_class_schedule();

drop trigger if exists trg_guard_published_professional_class_schedule on public.professional_classes;
create trigger trg_guard_published_professional_class_schedule
before insert or update or delete on public.professional_classes
for each row execute function public.guard_published_class_schedule();

-- Once published, an offer cannot be returned to draft status.
create or replace function public.prevent_unpublishing_scheduled_offer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('published', 'archived') and new.status = 'draft' then
    raise exception 'Une offre déjà publiée ne peut pas redevenir un brouillon : son calendrier est définitif.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unpublishing_scheduled_offer on public.professional_offers;
create trigger trg_prevent_unpublishing_scheduled_offer
before update of status on public.professional_offers
for each row execute function public.prevent_unpublishing_scheduled_offer();
