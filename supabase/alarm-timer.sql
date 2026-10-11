-- KG Finance: the every-minute timer for alarms and timed reminders.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Before running, replace the two placeholders:
--   YOUR_APP_URL  the deployed site, e.g. https://kg-finance.vercel.app (no trailing slash)
--   YOUR_CRON_SECRET  the same value as CRON_SECRET in Vercel's environment variables
--
-- What it does: every minute, Supabase calls /api/push/tick, which sends any
-- alarm, timed reminder, snooze or heads-up whose minute has come.
-- To stop it later:  select cron.unschedule('kg-alarm-tick');

-- 1. The send log: each ring is claimed here once, so it is never sent twice.
create table if not exists public.push_log (
  key text primary key,
  workspace_id text not null,
  sent_at timestamptz not null default now()
);
create index if not exists push_log_sent_at_idx on public.push_log (sent_at);
alter table public.push_log enable row level security;
drop policy if exists "open push log" on public.push_log;
create policy "open push log" on public.push_log
  for all to anon, authenticated using (true) with check (true);

-- 2. The timer. pg_cron runs the schedule; pg_net makes the web request.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running this file replaces the job instead of adding a second one.
select cron.unschedule('kg-alarm-tick')
where exists (select 1 from cron.job where jobname = 'kg-alarm-tick');

select cron.schedule(
  'kg-alarm-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'YOUR_APP_URL/api/push/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 20000
  );
  $$
);

-- Check it is there:
--   select jobname, schedule, active from cron.job;
-- See the last few calls and their answers:
--   select status_code, content, created from net._http_response order by created desc limit 5;
