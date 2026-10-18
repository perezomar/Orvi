-- ============================================================
-- Orvi: read-only share links for parents, tutors and coaches
-- (run once in the Supabase SQL Editor, after schema.sql).
--
-- A link shows ONE person's upcoming tasks and a few totals.
-- It never shows notes, links, grades, flashcards or other people.
-- The owner can turn a link off at any time.
-- ============================================================
create table if not exists public.profile_shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_key text not null check (char_length(profile_key) between 1 and 64),
  token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  show_titles boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (owner_id, profile_key)
);

alter table public.profile_shares enable row level security;
drop policy if exists "shares_select_own" on public.profile_shares;
drop policy if exists "shares_insert_own" on public.profile_shares;
drop policy if exists "shares_update_own" on public.profile_shares;
drop policy if exists "shares_delete_own" on public.profile_shares;
create policy "shares_select_own" on public.profile_shares for select to authenticated using (owner_id = (select auth.uid()));
create policy "shares_insert_own" on public.profile_shares for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "shares_update_own" on public.profile_shares for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "shares_delete_own" on public.profile_shares for delete to authenticated using (owner_id = (select auth.uid()));

-- Public, read-only view for someone holding the link. Returns only the fields listed here.
create or replace function public.get_share(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  s record;
  d jsonb;
  out_tasks jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into s from public.profile_shares where token = p_token;
  if not found then return null; end if;
  select data into d from public.student_profiles where owner_id = s.owner_id and key = s.profile_key;
  if d is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'title',  case when s.show_titles then t->>'title' else null end,
      'course', coalesce((select c->>'name' from jsonb_array_elements(coalesce(d->'courses','[]'::jsonb)) c where c->>'id' = t->>'courseId' limit 1), ''),
      'type',   t->>'taskType',
      'due',    t->>'dueDate',
      'status', t->>'status',
      'done',   t->>'completedAt'
    )), '[]'::jsonb)
  into out_tasks
  from jsonb_array_elements(coalesce(d->'tasks','[]'::jsonb)) t
  where (t->>'dueDate') >= to_char(current_date - 8, 'YYYY-MM-DD')
    and (t->>'dueDate') <= to_char(current_date + 21, 'YYYY-MM-DD');

  return jsonb_build_object(
    'name',   coalesce(nullif(d->>'name',''), 'Student'),
    'titles', s.show_titles,
    'tasks',  out_tasks
  );
end;
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
