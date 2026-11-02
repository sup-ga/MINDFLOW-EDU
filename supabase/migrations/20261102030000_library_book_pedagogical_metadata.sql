-- Book editorial and pedagogical metadata used by the public work detail page.
alter table public.library_books
  add column if not exists genre text,
  add column if not exists subject_name text,
  add column if not exists education_level text,
  add column if not exists target_audience text,
  add column if not exists themes text[] not null default '{}'::text[];
