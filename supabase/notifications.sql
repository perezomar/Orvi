-- ============================================================
-- Orvi: email briefings (run once in the Supabase SQL Editor,
-- AFTER schema.sql). Step 2 (the schedule) is at the bottom.
-- ============================================================

-- Step 1: each account's briefing settings. Users can only see/change their own row.
create table if not exists public.notif_settings (
  owner_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  tz            text not null default 'America/Chicago' check (char_length(tz) <= 64),
  morning       time not null default '07:30',
  evening       time not null default '19:00',
  last_morning  date,
  last_evening  date,
  updated_at    timestamptz not null default now()
);

alter table public.notif_settings enable row level security;
drop policy if exists "notif_select_own" on public.notif_settings;
drop policy if exists "notif_insert_own" on public.notif_settings;
drop policy if exists "notif_update_own" on public.notif_settings;
create policy "notif_select_own" on public.notif_settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "notif_insert_own" on public.notif_settings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "notif_update_own" on public.notif_settings
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ============================================================
-- Step 2: the schedule. Do this ONLY after you have deployed the
-- send-briefings function (README Part 8).
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET, then run.
-- (Also turn on the pg_cron and pg_net extensions under
--  Database > Extensions if they are not already on.)
-- ============================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('orvi-briefings', '*/5 * * * *', $$
--   select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-briefings',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
-- To stop it later:  select cron.unschedule('orvi-briefings');
