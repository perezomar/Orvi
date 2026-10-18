-- ============================================================
-- Orvi: quiet hours and "falling behind" alerts (run once in the
-- Supabase SQL Editor, AFTER notifications.sql and push.sql).
-- ============================================================
alter table public.notif_settings add column if not exists quiet_start time;
alter table public.notif_settings add column if not exists quiet_end time;
alter table public.notif_settings add column if not exists behind_alerts boolean not null default true;
