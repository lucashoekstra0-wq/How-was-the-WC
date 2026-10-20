-- =====================================================================
--  How was the WC?  —  database-opzet voor Supabase
--  Plak dit hele bestand in Supabase > SQL Editor > New query > Run.
--  Je kunt het veilig opnieuw draaien.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. (Optioneel) Alleen collega's toelaten
--    Vul hieronder het domein van jullie werk-e-mail in, bijv. 'bedrijf.nl'.
--    Leeg laten ('') = iedereen met de link kan een account maken.
-- ---------------------------------------------------------------------
create or replace function public.allowed_email_domain()
returns text language sql immutable as $$
  select ''::text   -- <-- bijv. 'bedrijf.nl'
$$;

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category    text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 500),
  location    text check (char_length(location) <= 60),
  photo_path  text,
  created_at  timestamptz not null default now()
);
create index if not exists posts_created_at_idx on public.posts (created_at desc);

create table if not exists public.confirmations (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2. Beveiliging (Row Level Security)
--    Ingelogde collega's mogen alles lezen, maar alleen hun eigen
--    meldingen plaatsen/verwijderen.
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.confirmations enable row level security;

drop policy if exists "profiles lezen"        on public.profiles;
drop policy if exists "eigen profiel wijzigen" on public.profiles;
create policy "profiles lezen" on public.profiles
  for select to authenticated using (true);
create policy "eigen profiel wijzigen" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "posts lezen"            on public.posts;
drop policy if exists "eigen post plaatsen"    on public.posts;
drop policy if exists "eigen post verwijderen" on public.posts;
create policy "posts lezen" on public.posts
  for select to authenticated using (true);
create policy "eigen post plaatsen" on public.posts
  for insert to authenticated with check (user_id = auth.uid());
create policy "eigen post verwijderen" on public.posts
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "bevestigingen lezen"      on public.confirmations;
drop policy if exists "bevestigen"               on public.confirmations;
drop policy if exists "bevestiging intrekken"    on public.confirmations;
create policy "bevestigingen lezen" on public.confirmations
  for select to authenticated using (true);
create policy "bevestigen" on public.confirmations
  for insert to authenticated with check (
    user_id = auth.uid()
    and not exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );
create policy "bevestiging intrekken" on public.confirmations
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Profiel automatisch aanmaken bij registratie
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dom text := public.allowed_email_domain();
begin
  if dom <> '' and lower(split_part(new.email, '@', 2)) <> lower(dom) then
    raise exception 'Alleen e-mailadressen van @% mogen meedoen', dom;
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  split_part(new.email, '@', 1)), 40)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. Opslag voor foto's
--    Iedereen uploadt in een eigen map (zijn gebruikers-id).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wc foto lezen"       on storage.objects;
create policy "wc foto lezen" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

drop policy if exists "wc foto uploaden"    on storage.objects;
drop policy if exists "wc foto verwijderen" on storage.objects;
create policy "wc foto uploaden" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "wc foto verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
