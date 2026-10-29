-- MindFlow: suivi partagé des prestations de répétiteur, confirmations de séance et rémunérations.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.professional_contact_offers
  add column if not exists request_id uuid references public.tutor_requests(id) on delete set null;
create index if not exists professional_contact_offers_request_id_idx on public.professional_contact_offers(request_id);

create table if not exists public.tutor_prestations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.tutor_requests(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete restrict,
  professional_id uuid not null references public.professional_profiles(id) on delete restrict,
  subscription_group_id uuid not null default gen_random_uuid(),
  period_number integer not null default 1 check (period_number > 0),
  subject text not null check (char_length(trim(subject)) between 2 and 120),
  title text not null default 'Prestation de soutien scolaire' check (char_length(trim(title)) between 2 and 160),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'XAF' check (currency = 'XAF'),
  session_count integer not null check (session_count between 1 and 500),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','active','completed','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded')),
  payment_reference text,
  paid_at timestamptz,
  commission_rate numeric(5,4) not null default 0.3300 check (commission_rate = 0.3300),
  commission_amount numeric(12,2) generated always as (round(price * commission_rate, 2)) stored,
  provider_amount numeric(12,2) generated always as (price - round(price * commission_rate, 2)) stored,
  payout_status text not null default 'not_eligible' check (payout_status in ('not_eligible','held','eligible','paid','cancelled')),
  payout_reference text,
  payout_paid_at timestamptz,
  starts_on date,
  ends_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_group_id, period_number)
);
create index if not exists tutor_prestations_learner_idx on public.tutor_prestations(learner_id, created_at desc);
create index if not exists tutor_prestations_professional_idx on public.tutor_prestations(professional_id, created_at desc);
create index if not exists tutor_prestations_request_idx on public.tutor_prestations(request_id);

create table if not exists public.tutor_prestation_sessions (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references public.tutor_prestations(id) on delete restrict,
  session_number integer not null check (session_number > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned','completed','not_completed','disputed','cancelled')),
  learner_confirmed boolean,
  professional_confirmed boolean,
  learner_note text,
  professional_note text,
  locked boolean not null default false,
  admin_resolution_reason text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(prestation_id, session_number)
);
create index if not exists tutor_prestation_sessions_prestation_idx on public.tutor_prestation_sessions(prestation_id, session_number);

create table if not exists public.tutor_prestation_events (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references public.tutor_prestations(id) on delete restrict,
  session_id uuid references public.tutor_prestation_sessions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('learner','professional','admin','system')),
  action text not null,
  reason text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tutor_prestation_events_prestation_idx on public.tutor_prestation_events(prestation_id, created_at desc);

alter table public.tutor_prestations enable row level security;
alter table public.tutor_prestation_sessions enable row level security;
alter table public.tutor_prestation_events enable row level security;
grant select, insert, update, delete on public.tutor_prestations to authenticated;
grant select, insert, update, delete on public.tutor_prestation_sessions to authenticated;
grant select, insert on public.tutor_prestation_events to authenticated;

drop policy if exists tutor_prestations_read_participants on public.tutor_prestations;
create policy tutor_prestations_read_participants on public.tutor_prestations for select to authenticated using (
  learner_id=(select auth.uid())
  or exists(select 1 from public.professional_profiles p where p.id=professional_id and p.user_id=(select auth.uid()))
  or public.is_professional_reviewer()
);
drop policy if exists tutor_prestations_admin_insert on public.tutor_prestations;
create policy tutor_prestations_admin_insert on public.tutor_prestations for insert to authenticated with check (public.is_professional_reviewer() and created_by=(select auth.uid()));
drop policy if exists tutor_prestations_admin_update on public.tutor_prestations;
create policy tutor_prestations_admin_update on public.tutor_prestations for update to authenticated using (public.is_professional_reviewer()) with check (public.is_professional_reviewer());
drop policy if exists tutor_prestations_admin_delete on public.tutor_prestations;
create policy tutor_prestations_admin_delete on public.tutor_prestations for delete to authenticated using (public.is_professional_reviewer());

drop policy if exists tutor_prestation_sessions_read_participants on public.tutor_prestation_sessions;
create policy tutor_prestation_sessions_read_participants on public.tutor_prestation_sessions for select to authenticated using (
 exists(select 1 from public.tutor_prestations t where t.id=prestation_id and (
  t.learner_id=(select auth.uid()) or exists(select 1 from public.professional_profiles p where p.id=t.professional_id and p.user_id=(select auth.uid())) or public.is_professional_reviewer()
 ))
);
drop policy if exists tutor_prestation_sessions_admin_insert on public.tutor_prestation_sessions;
create policy tutor_prestation_sessions_admin_insert on public.tutor_prestation_sessions for insert to authenticated with check (
 public.is_professional_reviewer() and created_by=(select auth.uid()) and exists(select 1 from public.tutor_prestations t where t.id=prestation_id)
);
drop policy if exists tutor_prestation_sessions_participant_update on public.tutor_prestation_sessions;
create policy tutor_prestation_sessions_participant_update on public.tutor_prestation_sessions for update to authenticated using (
 exists(select 1 from public.tutor_prestations t where t.id=prestation_id and (
  t.learner_id=(select auth.uid()) or exists(select 1 from public.professional_profiles p where p.id=t.professional_id and p.user_id=(select auth.uid())) or public.is_professional_reviewer()
 ))
) with check (
 exists(select 1 from public.tutor_prestations t where t.id=prestation_id and (
  t.learner_id=(select auth.uid()) or exists(select 1 from public.professional_profiles p where p.id=t.professional_id and p.user_id=(select auth.uid())) or public.is_professional_reviewer()
 ))
);
drop policy if exists tutor_prestation_sessions_admin_delete on public.tutor_prestation_sessions;
create policy tutor_prestation_sessions_admin_delete on public.tutor_prestation_sessions for delete to authenticated using (public.is_professional_reviewer());

drop policy if exists tutor_prestation_events_read_participants on public.tutor_prestation_events;
create policy tutor_prestation_events_read_participants on public.tutor_prestation_events for select to authenticated using (
 exists(select 1 from public.tutor_prestations t where t.id=prestation_id and (
  t.learner_id=(select auth.uid()) or exists(select 1 from public.professional_profiles p where p.id=t.professional_id and p.user_id=(select auth.uid())) or public.is_professional_reviewer()
 ))
);
drop policy if exists tutor_prestation_events_insert_participants on public.tutor_prestation_events;
create policy tutor_prestation_events_insert_participants on public.tutor_prestation_events for insert to authenticated with check (
 actor_id=(select auth.uid()) and exists(select 1 from public.tutor_prestations t where t.id=prestation_id and (
  t.learner_id=(select auth.uid()) or exists(select 1 from public.professional_profiles p where p.id=t.professional_id and p.user_id=(select auth.uid())) or public.is_professional_reviewer()
 ))
);
drop policy if exists tutor_requests_provider_read_linked_prestations on public.tutor_requests;
create policy tutor_requests_provider_read_linked_prestations on public.tutor_requests for select to authenticated using (
 exists(select 1 from public.tutor_prestations t join public.professional_profiles p on p.id=t.professional_id where t.request_id=tutor_requests.id and p.user_id=(select auth.uid()))
);

create or replace function private.guard_tutor_prestation_session()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,auth as $$
declare
  is_admin boolean := coalesce(public.is_professional_reviewer(),false);
  learner_owner uuid;
  professional_owner uuid;
begin
  select t.learner_id,p.user_id into learner_owner,professional_owner
  from public.tutor_prestations t join public.professional_profiles p on p.id=t.professional_id
  where t.id=new.prestation_id;
  if tg_op='INSERT' then
    if not is_admin then raise exception 'Seule l’administration peut créer une séance.'; end if;
    new.created_by:=auth.uid(); new.updated_at:=now(); return new;
  end if;
  if old.locked and not is_admin then raise exception 'Cette séance est verrouillée après confirmation des deux parties.'; end if;
  if is_admin then
    if old.locked and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')
       and (nullif(trim(new.admin_resolution_reason),'') is null or new.admin_resolution_reason is not distinct from old.admin_resolution_reason) then
      raise exception 'Toute correction administrative après verrouillage exige un nouveau motif explicite.';
    end if;
    if old.locked and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then new.resolved_by:=auth.uid(); new.resolved_at:=now(); end if;
    if old.status='disputed' and new.status in ('completed','not_completed') then
      if nullif(trim(new.admin_resolution_reason),'') is null then raise exception 'Ajoute le motif de résolution du désaccord.'; end if;
      new.resolved_by:=auth.uid(); new.resolved_at:=now(); new.locked:=true;
    end if;
  else
    if learner_owner=auth.uid() then
      if old.learner_confirmed is not null and new.learner_confirmed is distinct from old.learner_confirmed then raise exception 'Ta confirmation est déjà enregistrée. Contacte MindFlow en cas d’erreur.'; end if;
      if (to_jsonb(new)-array['learner_confirmed','learner_note','status','locked','updated_at']) is distinct from (to_jsonb(old)-array['learner_confirmed','learner_note','status','locked','updated_at']) then raise exception 'Tu peux uniquement confirmer ta séance ou ajouter un commentaire.'; end if;
      if new.professional_confirmed is distinct from old.professional_confirmed or new.professional_note is distinct from old.professional_note or new.admin_resolution_reason is distinct from old.admin_resolution_reason or new.resolved_by is distinct from old.resolved_by or new.resolved_at is distinct from old.resolved_at then raise exception 'Modification non autorisée.'; end if;
    elsif professional_owner=auth.uid() then
      if old.professional_confirmed is not null and new.professional_confirmed is distinct from old.professional_confirmed then raise exception 'Ta confirmation est déjà enregistrée. Contacte MindFlow en cas d’erreur.'; end if;
      if (to_jsonb(new)-array['professional_confirmed','professional_note','status','locked','updated_at']) is distinct from (to_jsonb(old)-array['professional_confirmed','professional_note','status','locked','updated_at']) then raise exception 'Tu peux uniquement confirmer ta séance ou ajouter un commentaire.'; end if;
      if new.learner_confirmed is distinct from old.learner_confirmed or new.learner_note is distinct from old.learner_note or new.admin_resolution_reason is distinct from old.admin_resolution_reason or new.resolved_by is distinct from old.resolved_by or new.resolved_at is distinct from old.resolved_at then raise exception 'Modification non autorisée.'; end if;
    else raise exception 'Accès non autorisé à cette séance.';
    end if;
    new.updated_at:=now();
    if new.learner_confirmed is false or new.professional_confirmed is false then new.status:='disputed';new.locked:=false;new.admin_resolution_reason:=null;new.resolved_by:=null;new.resolved_at:=null;
    elsif new.learner_confirmed is true and new.professional_confirmed is true then new.status:='completed';new.locked:=true;
    else new.status:='planned';new.locked:=false;end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_tutor_prestation_session() from public,anon,authenticated;

create or replace function private.recalculate_tutor_prestation(p_prestation_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare expected_count integer; paid_state text; current_payout text; total_count integer; completed_count integer; dispute_count integer;
begin
 select session_count,payment_status,payout_status into expected_count,paid_state,current_payout from public.tutor_prestations where id=p_prestation_id;
 if not found then return; end if;
 select count(*),count(*) filter(where status='completed' and locked=true),count(*) filter(where status='disputed')
 into total_count,completed_count,dispute_count from public.tutor_prestation_sessions where prestation_id=p_prestation_id;
 update public.tutor_prestations set
  payout_status=case when paid_state='refunded' then 'cancelled' when current_payout='paid' then 'paid' when paid_state<>'paid' then 'not_eligible' when dispute_count>0 then 'held' when total_count<expected_count or completed_count<expected_count then 'held' else 'eligible' end,
  status=case when paid_state='refunded' then 'cancelled' when paid_state<>'paid' then 'awaiting_payment' when total_count>=expected_count and completed_count>=expected_count and dispute_count=0 then 'completed' else 'active' end,
  updated_at=now()
 where id=p_prestation_id;
end $$;
revoke all on function private.recalculate_tutor_prestation(uuid) from public,anon,authenticated;

create or replace function private.recalculate_tutor_prestation_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform private.recalculate_tutor_prestation(coalesce(new.prestation_id,old.prestation_id));
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.recalculate_tutor_prestation_trigger() from public,anon,authenticated;
drop trigger if exists guard_tutor_prestation_session on public.tutor_prestation_sessions;
create trigger guard_tutor_prestation_session before insert or update on public.tutor_prestation_sessions for each row execute function private.guard_tutor_prestation_session();
drop trigger if exists recalculate_tutor_prestation_from_sessions on public.tutor_prestation_sessions;
create trigger recalculate_tutor_prestation_from_sessions after insert or update or delete on public.tutor_prestation_sessions for each row execute function private.recalculate_tutor_prestation_trigger();

create or replace function private.recalculate_tutor_prestation_payment_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform private.recalculate_tutor_prestation(new.id);return new;end $$;
revoke all on function private.recalculate_tutor_prestation_payment_trigger() from public,anon,authenticated;
drop trigger if exists recalculate_tutor_prestation_from_payment on public.tutor_prestations;
create trigger recalculate_tutor_prestation_from_payment after update of payment_status,session_count on public.tutor_prestations for each row execute function private.recalculate_tutor_prestation_payment_trigger();

create or replace function private.log_tutor_prestation_change()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,auth as $$
declare p_id uuid;s_id uuid;role_name text;action_name text;reason_text text;
begin
 if tg_table_name='tutor_prestations' then p_id:=coalesce(new.id,old.id);s_id:=null;action_name:=lower(tg_op)||'_prestation';reason_text:=case when tg_op='UPDATE' then coalesce(new.payout_reference,new.payment_reference) else null end;
 else p_id:=coalesce(new.prestation_id,old.prestation_id);s_id:=coalesce(new.id,old.id);action_name:=lower(tg_op)||'_session';reason_text:=case when tg_op='UPDATE' then new.admin_resolution_reason else null end;end if;
 if public.is_professional_reviewer() then role_name:='admin';
 elsif exists(select 1 from public.tutor_prestations t join public.professional_profiles p on p.id=t.professional_id where t.id=p_id and p.user_id=auth.uid()) then role_name:='professional';
 elsif exists(select 1 from public.tutor_prestations t where t.id=p_id and t.learner_id=auth.uid()) then role_name:='learner';
 else role_name:='system';end if;
 insert into public.tutor_prestation_events(prestation_id,session_id,actor_id,actor_role,action,reason,old_values,new_values)
 values(p_id,s_id,auth.uid(),role_name,action_name,reason_text,case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.log_tutor_prestation_change() from public,anon,authenticated;
drop trigger if exists audit_tutor_prestations on public.tutor_prestations;
create trigger audit_tutor_prestations after insert or update or delete on public.tutor_prestations for each row execute function private.log_tutor_prestation_change();
drop trigger if exists audit_tutor_prestation_sessions on public.tutor_prestation_sessions;
create trigger audit_tutor_prestation_sessions after insert or update or delete on public.tutor_prestation_sessions for each row execute function private.log_tutor_prestation_change();

comment on table public.tutor_prestations is 'Prestation de répétiteur payée par période; renouvellements conservés dans des périodes distinctes.';
comment on table public.tutor_prestation_sessions is 'Une ligne par séance. Verrouillage automatique après double confirmation positive; litiges résolus et tracés par l’administration.';
comment on table public.tutor_prestation_events is 'Journal d’audit des modifications de prestations et de séances.';
