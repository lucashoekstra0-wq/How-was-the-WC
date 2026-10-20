-- =====================================================================
--  How was the WC?  —  ADMIN toevoegen
--  1. Maak eerst zelf een account aan in de app.
--  2. Vul hieronder (onderaan) je e-mailadres in.
--  3. Plak alles in Supabase > SQL Editor > New query > Run.
-- =====================================================================

-- Kolom "is admin" op profielen
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Gewone gebruikers mogen alleen hun naam wijzigen, niet zichzelf admin maken
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

-- Hulpfunctie: is de ingelogde persoon admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Admin mag elke melding verwijderen
drop policy if exists "eigen post verwijderen" on public.posts;
create policy "eigen post verwijderen" on public.posts
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Admin mag elke foto verwijderen
drop policy if exists "wc foto verwijderen" on storage.objects;
create policy "wc foto verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- >>> Maak jezelf admin: vul je e-mailadres in <<<
update public.profiles set is_admin = true
where id = (select id from auth.users where lower(email) = lower('JOUW@EMAIL.NL'));

-- Controle: hier hoort jouw naam te staan
select display_name, is_admin from public.profiles where is_admin;
