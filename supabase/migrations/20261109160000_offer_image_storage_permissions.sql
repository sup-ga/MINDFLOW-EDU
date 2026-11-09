-- Autorise chaque professionnel à téléverser ses propres visuels d’offres.
-- Les fichiers sont rangés sous <auth.uid()>/offers/<uuid> dans mindflow-avatars.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mindflow-avatars', 'mindflow-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'MindFlow professionals upload own offer images'
  ) then
    create policy "MindFlow professionals upload own offer images"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'mindflow-avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
      and (storage.foldername(name))[2] = 'offers'
    );
  end if;
end $$;
