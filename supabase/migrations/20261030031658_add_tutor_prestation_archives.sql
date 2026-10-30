alter table public.tutor_prestations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists tutor_prestations_archived_at_idx
  on public.tutor_prestations (archived_at desc)
  where archived_at is not null;

comment on column public.tutor_prestations.archived_at is
  'Date à laquelle la prestation terminée a été déplacée dans les archives par un agent MindFlow.';
comment on column public.tutor_prestations.archived_by is
  'Compte administratif ayant archivé la prestation.';
