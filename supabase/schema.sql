-- ============================================================
-- Orvi: Supabase schema (run once in the Supabase SQL Editor)
-- ============================================================
-- One row per student profile. The profile's progress (tasks, XP, coins,
-- companions, purchases) lives in the `data` JSON column.
-- Row Level Security (RLS) makes sure each signed-in user can only ever
-- read or change their OWN rows. Do not skip the RLS lines.

-- ---------- Main table ----------
create table if not exists public.student_profiles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null check (char_length(key) between 1 and 64),
  label       text,
  data        jsonb not null default '{}'::jsonb check (octet_length(data::text) < 2000000),
  rev         integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, key)
);

alter table public.student_profiles enable row level security;

drop policy if exists "profiles_select_own" on public.student_profiles;
drop policy if exists "profiles_insert_own" on public.student_profiles;
drop policy if exists "profiles_update_own" on public.student_profiles;
drop policy if exists "profiles_delete_own" on public.student_profiles;

create policy "profiles_select_own" on public.student_profiles
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "profiles_insert_own" on public.student_profiles
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "profiles_update_own" on public.student_profiles
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "profiles_delete_own" on public.student_profiles
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- Automatic version history (progress safety net) ----------
create table if not exists public.student_profile_history (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.student_profiles(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  rev         integer not null,
  saved_at    timestamptz not null default now()
);
create index if not exists student_profile_history_idx
  on public.student_profile_history (profile_id, saved_at desc);

alter table public.student_profile_history enable row level security;
drop policy if exists "history_select_own" on public.student_profile_history;
-- Read-only for users. Only the trigger below (security definer) can write.
create policy "history_select_own" on public.student_profile_history
  for select to authenticated using (owner_id = (select auth.uid()));

-- Before each update: keep a snapshot of the old data (at most one per hour,
-- newest 48 kept) and stamp updated_at.
create or replace function public.snapshot_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.student_profile_history h
    where h.profile_id = old.id and h.saved_at > now() - interval '1 hour'
  ) then
    insert into public.student_profile_history (profile_id, owner_id, data, rev)
    values (old.id, old.owner_id, old.data, old.rev);
    delete from public.student_profile_history
    where profile_id = old.id
      and id not in (
        select id from public.student_profile_history
        where profile_id = old.id order by saved_at desc limit 48
      );
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_snapshot_profile on public.student_profiles;
create trigger trg_snapshot_profile
  before update on public.student_profiles
  for each row execute function public.snapshot_profile();

revoke all on function public.snapshot_profile() from public, anon, authenticated;

-- Take a snapshot on demand (the app calls this before a restore, reset or import
-- so the state being replaced is always recoverable).
create or replace function public.snapshot_profile_now(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_profile_history (profile_id, owner_id, data, rev)
  select id, owner_id, data, rev from public.student_profiles
  where id = p_id and owner_id = auth.uid();
end $$;

revoke all on function public.snapshot_profile_now(uuid) from public, anon;
grant execute on function public.snapshot_profile_now(uuid) to authenticated;

-- ---------- Account deletion (required by the App Store for apps with accounts) ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();   -- cascades to all of the user's rows
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
