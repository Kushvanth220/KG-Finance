-- KG Finance — database setup
--
-- Run this whole file once in Supabase → SQL Editor. It is safe to run again:
-- every statement is "if not exists" / "or replace", and nothing here drops
-- data.
--
-- One workspace = one shared set of finances. Every table is keyed by
-- workspace_id, which the app reads from NEXT_PUBLIC_WORKSPACE_ID (default
-- "default"). Access is open to the anon key — keep the key private; anyone
-- who has it can read and write the workspace.

-- ---------------------------------------------------------------------------
-- Finance state: one JSON document per workspace, merged by the app.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_finance (
  workspace_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_workspace_finance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_finance_updated_at on public.workspace_finance;
create trigger workspace_finance_updated_at
  before update on public.workspace_finance
  for each row
  execute function public.set_workspace_finance_updated_at();

-- The finance document is deliberately NOT published to Realtime: phones tell
-- each other about a save with a tiny broadcast message and then fetch the
-- row once. Streaming the document itself to every phone on every save was
-- the single largest bandwidth cost.

-- ---------------------------------------------------------------------------
-- Rules: user-authored logic (triggers, fields, follow-ups) and their entries.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_rules (
  workspace_id text primary key,
  data jsonb not null default '{"rules": [], "entries": [], "deleted": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Rules change rarely and are small, so this one is published for live updates.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_rules'
  ) then
    alter publication supabase_realtime add table public.workspace_rules;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assistant: preferences, chat history, usage, push subscriptions.
-- ---------------------------------------------------------------------------
create table if not exists public.assistant_preferences (
  workspace_id text primary key,
  assistant_name text default 'Assistant',
  voice_gender text default 'female' check (voice_gender in ('male', 'female')),
  wake_listening_enabled boolean not null default true,
  language text not null default 'en-US',
  behavior_instructions jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  user_id text not null check (user_id in ('kushvanth', 'g')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_sessions_workspace_user_idx
  on public.ai_chat_sessions (workspace_id, user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  workspace_id text not null,
  user_id text not null check (user_id in ('kushvanth', 'g')),
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_session_idx
  on public.ai_chat_messages (session_id, created_at asc);

create index if not exists ai_chat_messages_user_idx
  on public.ai_chat_messages (workspace_id, user_id, created_at desc);

create or replace function public.set_ai_chat_session_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_chat_sessions_updated_at on public.ai_chat_sessions;
create trigger ai_chat_sessions_updated_at
  before update on public.ai_chat_sessions
  for each row
  execute function public.set_ai_chat_session_updated_at();

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  provider text not null,
  model text not null,
  purpose text not null default 'chat',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_workspace_created_idx
  on public.ai_usage (workspace_id, created_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  workspace_id text not null,
  subscription jsonb not null,
  person text,
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_workspace_idx
  on public.push_subscriptions (workspace_id);

-- Each alarm ring claimed once, so the every-minute timer never sends it twice.
-- The timer itself is in supabase/alarm-timer.sql.
create table if not exists public.push_log (
  key text primary key,
  workspace_id text not null,
  sent_at timestamptz not null default now()
);

create index if not exists push_log_sent_at_idx on public.push_log (sent_at);

-- ---------------------------------------------------------------------------
-- Row level security: open to the anon key (no login in this app).
-- ---------------------------------------------------------------------------
alter table public.workspace_finance enable row level security;
alter table public.workspace_rules enable row level security;
alter table public.assistant_preferences enable row level security;
alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

drop policy if exists "open workspace finance" on public.workspace_finance;
create policy "open workspace finance" on public.workspace_finance
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open workspace rules" on public.workspace_rules;
create policy "open workspace rules" on public.workspace_rules
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open assistant preferences" on public.assistant_preferences;
create policy "open assistant preferences" on public.assistant_preferences
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open ai chat sessions" on public.ai_chat_sessions;
create policy "open ai chat sessions" on public.ai_chat_sessions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open ai chat messages" on public.ai_chat_messages;
create policy "open ai chat messages" on public.ai_chat_messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open ai usage" on public.ai_usage;
create policy "open ai usage" on public.ai_usage
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open push subscriptions" on public.push_subscriptions;
create policy "open push subscriptions" on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open push log" on public.push_log;
create policy "open push log" on public.push_log
  for all to anon, authenticated using (true) with check (true);
