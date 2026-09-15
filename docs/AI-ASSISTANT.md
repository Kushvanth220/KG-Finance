# AI assistant (text + live voice)

The assistant reads the workspace ledger, answers questions, and proposes writes that the user
confirms in the app. Each member (`kushvanth` / `g`) has separate chat sessions and a finance
snapshot scoped to them.

| Mode | Where | Transport |
|---|---|---|
| Text chat | Assistant → Text chat | `POST /api/ai/chat` → Gemini text model |
| Live voice | Assistant → Live voice | Browser ↔ Gemini Live WebSocket with a short-lived token |

## Setup

1. Run `supabase/setup.sql` once (creates the chat, preferences and usage tables).
2. Get a key from [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`
   (server-only — never `NEXT_PUBLIC_`).
3. Optional: `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` enable the review council, where a second
   model checks the draft reply before it is shown.
4. Optional overrides: `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`.

## Live voice — how the key stays private

```
Browser  → POST /api/ai/live-token { user_id }
            server reads the ledger, scopes it to that member,
            builds the system instruction, mints an ephemeral token (≈30 min, single use)
         ← short-lived token (never the API key)
Browser  ↔ Gemini Live (WebSocket): 16 kHz PCM up, 24 kHz PCM + transcripts down
```

## Writes need a confirmation

Every tool that moves money (`record_expense`, `record_income`, `add_debt`, …) returns a proposal;
the app renders a confirmation card and only the user's tap sets `user_confirmed`. The server
rejects any write the model tries to mark confirmed itself
(`src/lib/ai/assistant-confirmation.ts`). Reminders, rules and memory edits do not need a name
or a confirmation — they are shared.

## Who is speaking

Money belongs to a person, so before the first money write the assistant asks who it is talking
to. Spoken names are matched through a small alias table (`src/lib/ai/person.ts`), which is where
to add spellings speech-to-text keeps producing.

## API routes

| Route | Purpose |
|---|---|
| `POST /api/ai/chat` | Text message; runs tools, returns reply + proposals |
| `POST /api/ai/live-token` | Ephemeral token for live voice |
| `GET /api/ai/sessions?user_id=` | Chat sessions for a member |
| `GET /api/ai/history?user_id=&session_id=` | Messages in a session |
| `GET/POST /api/ai/preferences` | Assistant name, voice, behaviour instructions, reminders |
| `GET /api/ai/providers` | Which providers are configured |
| `GET /api/ai/usage?month=` | Token usage and estimated cost |

## Troubleshooting

| Problem | Fix |
|---|---|
| `GEMINI_API_KEY is not configured` | Add it to `.env.local`, restart `npm run dev` |
| Chat table not found | Run `supabase/setup.sql` |
| Microphone blocked | Browser settings → allow the mic for this origin |
| Assistant records under the wrong person | It asks who is speaking first; answer with a name |
