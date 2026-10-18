-- ============================================================
-- Orvi: AI scanner usage limit (run once in the Supabase SQL Editor).
-- Counts scans per person per day so one account cannot run up your bill.
-- Only the server function (service role) can use it.
-- ============================================================
create table if not exists public.scan_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day      date not null default current_date,
  n        integer not null default 0,
  primary key (owner_id, day)
);
alter table public.scan_usage enable row level security;   -- no policies: nobody but the service role can read or write

create or replace function public.bump_scan(p_owner uuid, p_limit integer)
returns integer     -- scans used today after this one, or -1 if the daily limit is already reached
language plpgsql
security definer
set search_path = public
as $$
declare used integer;
begin
  insert into public.scan_usage(owner_id, day, n) values (p_owner, current_date, 0) on conflict do nothing;
  update public.scan_usage set n = n + 1 where owner_id = p_owner and day = current_date and n < p_limit returning n into used;
  if used is null then return -1; end if;
  return used;
end;
$$;
revoke all on function public.bump_scan(uuid, integer) from public, anon, authenticated;
grant execute on function public.bump_scan(uuid, integer) to service_role;
