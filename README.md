# KG Finance

A private, two-person finance app that lives on both phones and always agrees with itself.
Spending, income, accounts, debts, a running "who owes whom" balance, user-authored rules for
irregular income, and an AI assistant that can read and — with confirmation — write to the ledger.

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand and Supabase. Deployed on Vercel.
No accounts, no login: one shared workspace key, one Supabase project, two installs.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Deploying](#deploying)
- [Scripts](#scripts)
- [Testing and quality](#testing-and-quality)
- [Security notes](#security-notes)
- [License](#license)

---

## Features

**Everyday money**
- **Spend** — one screen to log an expense: amount (with `+`/`-` expressions), category tiles with
  emoji and budgets, who it is for, who paid, split shares, refunds, notes, date/time.
- **Home** — the month at a glance: available cash, what is on the cards, spend pace, category
  breakdown with selectable chart types, upcoming bills, own debts vs. credit-card debts, a date
  range filter.
- **Accounts** — debit, credit and cash accounts per person, shared accounts, balance history,
  deposits and transfers.
- **Income, Debts, Expenses (bills)** — recurring bills with due dates, debt payoff tracking,
  income sources and entries.
- **History** — every transaction with full detail, plus an append-only audit log of deletions.

**Two people, one ledger**
- **Balance** — a cent-exact running settlement between the two members. Bank spends for the other
  person update it automatically; cash and outside money are added by hand. A timeline, a paid
  donut, and month insights explain how it moved.
- Splits are computed once with `splitMoney` and never re-rounded, so the balance is never off by a
  penny.

**Irregular income (Rules)**
- Describe how something works — "daily blocks, base pay when the block finishes, tips land 27
  hours later" — and the app builds a **rule**: a trigger question, fields, timed follow-ups,
  calculations and charts. Log entries under it, get chased for the follow-ups, see the totals.
- A dedicated **gig-income** page (built around Amazon Flex) tracks blocks, base vs. tips, and
  payout deposits on the days money actually lands.

**Memory and reminders**
- **Memory** — the assistant's editable knowledge base: bills, reminders (structured schedules),
  behaviour instructions and standing rules.
- **Push notifications** — a daily Vercel cron works out what is due and pushes to each registered
  phone (Web Push / VAPID). Devices registered to one person hear about their own bills plus
  shared ones.

**AI assistant (optional)**
- Text chat and live voice (Gemini Live over WebSocket with short-lived tokens).
- Reads the ledger, answers questions, and proposes writes — every money write goes through a
  confirmation card the user must accept; the assistant can never mark something confirmed itself.
- An optional "council": a second model reviews the draft reply before it is shown.

**Sync**
- Three-way merge (base / local / cloud) per record with delta merging for running balances, so
  two phones editing at once never overwrite each other.
- Optimistic concurrency on the cloud row, realtime notifications, and a **Sync** page that shows
  truthfully what is on this phone vs. in the cloud, with a *Sync now* button.

---

## How it works

```
┌──────────────┐   localStorage    ┌──────────────┐
│  Phone A     │◄────────────────►│ Zustand store│
│  (Next.js)   │                   └──────┬───────┘
└──────┬───────┘                          │ three-way merge, conditional update
       │ HTTPS / Realtime                 ▼
┌──────▼──────────────────────────────────────────────┐
│ Supabase (Postgres + Realtime)                       │
│  workspace_finance   one JSON document per workspace │
│  workspace_rules     rules + entries + tombstones    │
│  assistant_*, ai_*   assistant state, chat, usage    │
│  push_subscriptions  one row per device              │
└──────▲──────────────────────────────────────────────┘
       │
┌──────┴───────┐
│  Phone B     │
└──────────────┘
```

- **State** lives in one Zustand store persisted to `localStorage`, mirrored to a single JSONB row in
  `workspace_finance`. Each phone keeps the last state both sides agreed on (the *base*); on every
  push or pull the three versions are merged by record id
  ([`src/lib/finance-merge.ts`](src/lib/finance-merge.ts)).
- **Writes are conditional** on the cloud row's `updated_at`; a save that lands on a stale stamp is
  merged again and retried ([`src/lib/supabase/sync.ts`](src/lib/supabase/sync.ts)).
- **Rules** are stored separately in `workspace_rules` and merged as a union with tombstones, so a
  delete on one device is not undone by the other.
- **Money maths** always goes through [`src/lib/money.ts`](src/lib/money.ts) (`roundMoney`,
  `splitMoney`) — no per-step rounding anywhere.
- **Dates** are resolved in one configured time zone
  ([`src/lib/zoned-date.ts`](src/lib/zoned-date.ts)), because UTC midnight is not the user's midnight.
- **Assistant writes** are validated server-side and require an explicit user confirmation
  ([`src/lib/ai/assistant-confirmation.ts`](src/lib/ai/assistant-confirmation.ts)).

---

## Project structure

```
src/
  app/
    (app)/            pages: dashboard, spend, balance, accounts, income, debts,
                      expenses, history, flex, rules, memory, assistant, sync
    api/              route handlers: sync-config, cloud-health, rules, push/*, ai/*
    intro/            the front door shown on a first visit
  components/         UI by area (dashboard, balance, flex, memory, assistant, layout, ui)
  store/              Zustand stores: finance, rules, assistant preferences, celebration
  lib/                domain logic: money, settlement, merge, sync, flex, rules engine, AI
  types/              shared types (FinanceState, Transaction, Person, …)
scripts/              Supabase backup / restore / fetch, data checks
supabase/setup.sql    complete, idempotent database schema
public/sw.js          service worker for push notifications
```

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- A [Supabase](https://supabase.com) project (free tier is fine)
- Optional: a Gemini API key for the assistant, VAPID keys for push

### 1. Database

In Supabase → **SQL Editor**, paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and run
it. It is idempotent — safe to run again after upgrades.

### 2. Environment

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project
Settings → API). Everything else is optional — see [Configuration](#configuration).

### 3. Run

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. The first visit shows the intro; **More → Sync** shows whether the
cloud is reachable and what is on this device vs. the cloud.

---

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (publishable) key |
| `NEXT_PUBLIC_WORKSPACE_ID` | no | Which workspace row this deployment uses. Default `default`. |
| `NEXT_PUBLIC_TIME_ZONE` | no | IANA zone for "today" and month boundaries. Default `America/Chicago`. |
| `GEMINI_API_KEY` | for AI | Gemini text + live voice. Server-only. |
| `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE` | no | Model / voice overrides |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | no | Second opinion in the assistant council |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | no | Third opinion in the assistant council |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Web Push keys (`npx web-push generate-vapid-keys`) |
| `CRON_SECRET` | for push | Shared secret the Vercel cron sends to `/api/push/run` |

The two people in a workspace are identified by the stable ids `kushvanth` and `g`; their display
names live in one place, [`src/lib/branding.ts`](src/lib/branding.ts).

---

## Deploying

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project**, import the repo, and add the environment variables above.
3. Deploy. The cron in [`vercel.json`](vercel.json) calls `/api/push/run` once a day.
4. Open the same URL on both phones and add it to the home screen. That is the whole install.

After changing environment variables on Vercel, **Redeploy** so the new values are baked in.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (webpack) — `npm run dev:turbo` for Turbopack |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm test` / `npm run test:watch` | Vitest unit tests |
| `npm run backup:supabase` | Download the workspace row to `backups/<stamp>/` (git-ignored) |
| `npm run restore:supabase -- backups/<folder>/workspace-finance.json` | Upload a finance backup to Supabase |
| `npm run restore:workspace -- <folder> [--dry-run]` | Restore a whole workspace (finance, rules, assistant, chats) into a fresh project |

---

## Testing and quality

- `npm test` — 12 suites covering money rounding and splitting, settlement recalculation, the
  three-way merge, refunds, flex deposits and payouts, rule sync, reminders and spend assist.
- `npx tsc --noEmit` — strict TypeScript.
- `npm run lint` — zero errors is the bar; the React Compiler plugin is on.
- `npm run build` — production build must pass before deploying.

---

## Security notes

- There is **no authentication**. Access is the Supabase anon key plus the workspace id, and the row
  level security policies in `setup.sql` are open to the anon role. Treat the anon key as a secret:
  never commit `.env.local`, and rotate the key in Supabase if it ever leaks.
- AI provider keys are read server-side only. The browser receives a short-lived Gemini token for
  live voice, never the API key.
- The assistant cannot mark a money write as confirmed; only the user's tap on the confirmation
  card does.
- Local backups under `backups/` contain real data and are git-ignored.

---

## License

[MIT](LICENSE)
