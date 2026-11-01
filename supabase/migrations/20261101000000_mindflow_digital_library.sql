-- MindFlow Digital Library v1
-- Additive migration: existing products, orders, invoices and entitlements remain unchanged.

create table if not exists public.library_partners (
  id uuid primary key default gen_random_uuid(),
  partner_type text not null check (partner_type in ('author','publisher','rights_holder','distributor','institution')),
  display_name text not null,
  country text,
  website_url text,
  contact_email text,
  notes text,
  status text not null default 'pending' check (status in ('pending','verified','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  product_id uuid unique references public.products(id) on delete set null,
  slug text not null unique,
  title text not null,
  subtitle text,
  author_name text not null,
  description text not null default '',
  publisher_name text,
  publication_year integer,
  isbn text,
  language text not null default 'fr',
  country_of_origin text,
  book_type text not null default 'literary_work' check (book_type in ('literary_work','school_reading','reference')),
  access_mode text not null default 'paid' check (access_mode in ('free','paid','partner')),
  cover_path text,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.library_categories(id) on delete set null,
  slug text not null unique,
  name text not null,
  description text,
  display_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.library_book_categories (
  book_id uuid not null references public.library_books(id) on delete cascade,
  category_id uuid not null references public.library_categories(id) on delete cascade,
  primary key(book_id, category_id)
);

create table if not exists public.library_licenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  partner_id uuid references public.library_partners(id) on delete set null,
  rights_type text not null check (rights_type in ('public_domain','direct_author','publisher_license','partner_distribution')),
  territory text[] not null default array['GA']::text[],
  valid_from date,
  valid_until date,
  allow_online_reading boolean not null default false,
  allow_download boolean not null default false,
  allow_sale boolean not null default false,
  revenue_share_percent numeric(5,2) check (revenue_share_percent between 0 and 100),
  contract_reference text,
  contract_file_path text,
  status text not null default 'pending' check (status in ('pending','active','expired','revoked')),
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table if not exists public.library_files (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  file_kind text not null check (file_kind in ('pdf','epub','preview','cover','supplement')),
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  allow_online_reading boolean not null default false,
  allow_download boolean not null default false,
  is_primary boolean not null default false,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique(book_id, storage_path)
);

create table if not exists public.library_programs (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'GA',
  education_system text,
  grade_level text not null,
  subject_name text not null,
  program_year integer,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.library_book_programs (
  book_id uuid not null references public.library_books(id) on delete cascade,
  program_id uuid not null references public.library_programs(id) on delete cascade,
  relevance text not null default 'recommended' check (relevance in ('required','recommended','supplementary')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  primary key(book_id, program_id)
);

create table if not exists public.library_guides (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  guide_type text not null check (guide_type in ('reading_sheet','summary','analysis','vocabulary','exercise','context')),
  title text not null,
  content_markdown text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_book_professionals (
  book_id uuid not null references public.library_books(id) on delete cascade,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  contribution_role text not null default 'tutor',
  display_order integer not null default 100,
  primary key(book_id, professional_id)
);

create table if not exists public.learner_library_books (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  access_origin text not null check (access_origin in ('free','purchase','partner_grant','admin_grant')),
  entitlement_id uuid references public.learner_entitlements(id) on delete set null,
  added_at timestamptz not null default now(),
  unique(learner_id, book_id)
);

create table if not exists public.library_favorites (
  learner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(learner_id, book_id)
);

create table if not exists public.library_reading_progress (
  learner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  current_location jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(learner_id, book_id)
);

create index if not exists library_books_public_idx on public.library_books(status, featured, published_at desc);
create index if not exists library_books_author_idx on public.library_books(author_name);
create index if not exists library_files_book_idx on public.library_files(book_id, display_order);
create index if not exists library_licenses_book_status_idx on public.library_licenses(book_id, status);
create index if not exists learner_library_books_owner_idx on public.learner_library_books(learner_id, added_at desc);

alter table public.library_partners enable row level security;
alter table public.library_books enable row level security;
alter table public.library_categories enable row level security;
alter table public.library_book_categories enable row level security;
alter table public.library_licenses enable row level security;
alter table public.library_files enable row level security;
alter table public.library_programs enable row level security;
alter table public.library_book_programs enable row level security;
alter table public.library_guides enable row level security;
alter table public.library_book_professionals enable row level security;
alter table public.learner_library_books enable row level security;
alter table public.library_favorites enable row level security;
alter table public.library_reading_progress enable row level security;

drop policy if exists "Published books are public" on public.library_books;
create policy "Published books are public" on public.library_books for select to anon, authenticated using (status='published');
drop policy if exists "Active categories are public" on public.library_categories;
create policy "Active categories are public" on public.library_categories for select to anon, authenticated using (is_active=true);
drop policy if exists "Published book categories are public" on public.library_book_categories;
create policy "Published book categories are public" on public.library_book_categories for select to anon, authenticated using (exists(select 1 from public.library_books b where b.id=book_id and b.status='published'));
drop policy if exists "Published programs are public" on public.library_programs;
create policy "Published programs are public" on public.library_programs for select to anon, authenticated using (true);
drop policy if exists "Published book programs are public" on public.library_book_programs;
create policy "Published book programs are public" on public.library_book_programs for select to anon, authenticated using (exists(select 1 from public.library_books b where b.id=book_id and b.status='published'));
drop policy if exists "Published guides are public" on public.library_guides;
create policy "Published guides are public" on public.library_guides for select to anon, authenticated using (is_published=true and exists(select 1 from public.library_books b where b.id=book_id and b.status='published'));
drop policy if exists "Published book professionals are public" on public.library_book_professionals;
create policy "Published book professionals are public" on public.library_book_professionals for select to anon, authenticated using (exists(select 1 from public.library_books b where b.id=book_id and b.status='published'));
drop policy if exists "Learners see their own library books" on public.learner_library_books;
create policy "Learners see their own library books" on public.learner_library_books for select to authenticated using ((select auth.uid())=learner_id);
drop policy if exists "Learners see their own favorites" on public.library_favorites;
create policy "Learners see their own favorites" on public.library_favorites for select to authenticated using ((select auth.uid())=learner_id);
drop policy if exists "Learners manage their own favorites" on public.library_favorites;
create policy "Learners manage their own favorites" on public.library_favorites for all to authenticated using ((select auth.uid())=learner_id) with check ((select auth.uid())=learner_id);
drop policy if exists "Learners see their own reading progress" on public.library_reading_progress;
create policy "Learners see their own reading progress" on public.library_reading_progress for select to authenticated using ((select auth.uid())=learner_id);
drop policy if exists "Learners update their own reading progress" on public.library_reading_progress;
create policy "Learners update their own reading progress" on public.library_reading_progress for insert to authenticated with check ((select auth.uid())=learner_id);
drop policy if exists "Learners edit their own reading progress" on public.library_reading_progress;
create policy "Learners edit their own reading progress" on public.library_reading_progress for update to authenticated using ((select auth.uid())=learner_id) with check ((select auth.uid())=learner_id);

-- Keep the private partner/rights/files registry server-only: no client policies are granted.
revoke all on public.library_partners, public.library_licenses, public.library_files from anon, authenticated;
grant select on public.library_books, public.library_categories, public.library_book_categories, public.library_programs, public.library_book_programs, public.library_guides, public.library_book_professionals to anon, authenticated;
grant select on public.learner_library_books, public.library_favorites, public.library_reading_progress to authenticated;
grant insert, update, delete on public.library_favorites to authenticated;
grant insert, update on public.library_reading_progress to authenticated;

-- Paid book access follows the existing entitlement lifecycle; it does not create a second payment flow.
create or replace function public.sync_library_book_entitlement()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.product_id is not null and new.status='active' then
    insert into public.learner_library_books(learner_id,book_id,access_origin,entitlement_id)
    select new.learner_id,b.id,'purchase',new.id
    from public.library_books b
    where b.product_id=new.product_id and b.status='published'
    on conflict(learner_id,book_id) do update
      set access_origin='purchase', entitlement_id=excluded.entitlement_id;
  elsif new.product_id is not null then
    delete from public.learner_library_books llb
    using public.library_books b
    where llb.book_id=b.id
      and llb.learner_id=new.learner_id
      and llb.access_origin='purchase'
      and b.product_id=new.product_id
      and not exists (
        select 1 from public.learner_entitlements e
        where e.learner_id=new.learner_id
          and e.product_id=new.product_id
          and e.status='active'
      );
  end if;
  return new;
end;
$;
revoke all on function public.sync_library_book_entitlement() from public, anon, authenticated;
drop trigger if exists trg_sync_library_book_entitlement on public.learner_entitlements;
create trigger trg_sync_library_book_entitlement
after insert or update of status on public.learner_entitlements
for each row execute function public.sync_library_book_entitlement();

-- Backfill any already-confirmed purchases for books linked to a product.
insert into public.learner_library_books(learner_id,book_id,access_origin,entitlement_id)
select e.learner_id,b.id,'purchase',e.id
from public.learner_entitlements e
join public.library_books b on b.product_id=e.product_id
where e.status='active' and b.status='published'
on conflict(learner_id,book_id) do nothing;

-- Extend the existing private product bucket to accept EPUB while preserving its current MIME allow-list.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type)
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['application/epub+zip']::text[]) as mime_type
)
where id='mindflow-products';

-- Editorial credits and reading quizzes (answers remain server-side).
create table if not exists public.library_book_credits (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  partner_id uuid references public.library_partners(id) on delete set null,
  contributor_name text not null,
  contribution_role text not null default 'author',
  display_order integer not null default 100
);

create table if not exists public.library_quizzes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  title text not null,
  description text,
  passing_score numeric(5,2) not null default 50 check (passing_score between 0 and 100),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.library_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.library_quizzes(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'single_choice' check (question_type in ('single_choice','multiple_choice','true_false','short_answer')),
  explanation text,
  display_order integer not null default 100
);

create table if not exists public.library_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.library_quiz_questions(id) on delete cascade,
  answer_text text not null,
  is_correct boolean not null default false,
  display_order integer not null default 100
);

create table if not exists public.library_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.library_quizzes(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  score numeric(5,2) check (score between 0 and 100),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists library_quizzes_book_idx on public.library_quizzes(book_id,is_published);
create index if not exists library_quiz_questions_order_idx on public.library_quiz_questions(quiz_id,display_order);
create index if not exists library_quiz_answers_order_idx on public.library_quiz_answers(question_id,display_order);
create index if not exists library_quiz_attempts_owner_idx on public.library_quiz_attempts(learner_id,created_at desc);

alter table public.library_book_credits enable row level security;
alter table public.library_quizzes enable row level security;
alter table public.library_quiz_questions enable row level security;
alter table public.library_quiz_answers enable row level security;
alter table public.library_quiz_attempts enable row level security;

create policy "Published book credits are public" on public.library_book_credits
  for select to anon,authenticated using (
    exists(select 1 from public.library_books b where b.id=book_id and b.status='published')
  );
create policy "Published quizzes are public" on public.library_quizzes
  for select to anon,authenticated using (
    is_published=true and exists(select 1 from public.library_books b where b.id=book_id and b.status='published')
  );
create policy "Questions of published quizzes are public" on public.library_quiz_questions
  for select to anon,authenticated using (
    exists(select 1 from public.library_quizzes q join public.library_books b on b.id=q.book_id
      where q.id=quiz_id and q.is_published=true and b.status='published')
  );
-- Correct-answer rows are intentionally inaccessible to browser clients.
revoke all on public.library_quiz_answers from anon,authenticated;
grant select on public.library_book_credits,public.library_quizzes,public.library_quiz_questions to anon,authenticated;
grant select on public.library_quiz_attempts to authenticated;
create policy "Learners see their own quiz attempts" on public.library_quiz_attempts
  for select to authenticated using ((select auth.uid())=learner_id);
-- Quiz attempts are written only by the Edge Function after server-side grading.


-- Dedicated least-privilege administration for the digital library.
-- Only the account explicitly authorized for this workspace is seeded here.
create table if not exists public.library_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.library_admins enable row level security;
drop policy if exists "Library admins can read their own access" on public.library_admins;
create policy "Library admins can read their own access"
  on public.library_admins for select to authenticated
  using ((select auth.uid())=user_id and is_active=true);
grant select on public.library_admins to authenticated;
revoke insert,update,delete on public.library_admins from anon,authenticated;
insert into public.library_admins(user_id,is_active)
values ('8f3c8c2a-3d3a-41c2-99bc-da0198f65959',true)
on conflict(user_id) do update set is_active=excluded.is_active;

-- Keep a verifiable evidence reference for public-domain determinations.
alter table public.library_licenses
  add column if not exists evidence_reference text;

-- Starter shelves for the three editorial collections.
insert into public.library_categories(slug,name,description,display_order,is_active) values
 ('classiques-domaine-public','Classiques & domaine public','Œuvres dont la diffusion a été vérifiée comme relevant du domaine public.',10,true),
 ('auteurs-locaux-contemporains','Auteurs locaux & contemporains','Voix gabonaises, africaines et auteurs contemporains diffusés avec les autorisations nécessaires.',20,true),
 ('lectures-scolaires','Lectures scolaires & pédagogiques','Lectures recommandées, fiches et accompagnement pédagogique.',30,true)
on conflict(slug) do nothing;
