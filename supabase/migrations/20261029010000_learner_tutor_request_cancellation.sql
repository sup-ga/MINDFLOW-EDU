alter table public.tutor_requests
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text not null default '';

drop policy if exists "Learners cancel own tutor requests" on public.tutor_requests;
create policy "Learners cancel own tutor requests"
on public.tutor_requests
for update
to authenticated
using (
  learner_id = (select auth.uid())
  and status in ('pending','reviewing','matched')
)
with check (
  learner_id = (select auth.uid())
  and status = 'cancelled'
);

create or replace function public.guard_learner_tutor_request_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.learner_id then
    if old.status in ('pending','reviewing','matched') and new.status = 'cancelled' then
      if (to_jsonb(new) - array['status','cancelled_by','cancelled_at','cancellation_reason','updated_at'])
         is distinct from
         (to_jsonb(old) - array['status','cancelled_by','cancelled_at','cancellation_reason','updated_at']) then
        raise exception 'Un apprenant peut uniquement annuler sa demande, sans modifier les autres informations.';
      end if;
      new.cancelled_by := auth.uid();
      new.cancelled_at := now();
      new.cancellation_reason := 'Annulée par l’apprenant';
      new.updated_at := now();
    elsif new.status is distinct from old.status
       or (to_jsonb(new) - array['updated_at']) is distinct from (to_jsonb(old) - array['updated_at']) then
      raise exception 'Un apprenant peut uniquement annuler une demande encore ouverte.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_learner_tutor_request_cancellation on public.tutor_requests;
create trigger guard_learner_tutor_request_cancellation
before update on public.tutor_requests
for each row execute function public.guard_learner_tutor_request_cancellation();

comment on column public.tutor_requests.cancelled_by is 'Utilisateur ayant annulé la demande, si annulation par l’apprenant.';
comment on column public.tutor_requests.cancelled_at is 'Date de l’annulation de la demande.';
comment on column public.tutor_requests.cancellation_reason is 'Motif ou origine de l’annulation.';