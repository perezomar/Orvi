-- ============================================================
-- Orvi: phone/desktop push notifications (run once in the Supabase SQL Editor,
-- AFTER schema.sql and notifications.sql).
-- ============================================================
alter table public.notif_settings add column if not exists push_enabled boolean not null default false;
alter table public.notif_settings add column if not exists last_push_morning date;
alter table public.notif_settings add column if not exists last_push_evening date;

-- One row per device that turned notifications on.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 2000),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_update_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions for select to authenticated using (owner_id = (select auth.uid()));
create policy "push_insert_own" on public.push_subscriptions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "push_update_own" on public.push_subscriptions for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "push_delete_own" on public.push_subscriptions for delete to authenticated using (owner_id = (select auth.uid()));
