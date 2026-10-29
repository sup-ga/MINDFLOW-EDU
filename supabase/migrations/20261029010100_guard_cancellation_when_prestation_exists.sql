create or replace function public.guard_learner_tutor_request_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.learner_id then
    if old.status in ('pending','reviewing','matched') and new.status = 'cancelled' then
      if exists (
        select 1 from public.tutor_prestations p
        where p.request_id = old.id and p.status <> 'cancelled'
      ) then
        raise exception 'Cette demande est déjà liée à une prestation. Contacte MindFlow pour toute modification.';
      end if;
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