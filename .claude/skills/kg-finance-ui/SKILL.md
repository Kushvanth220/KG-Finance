---
name: kg-finance-ui
description: KG Finance's house style — glass cards, the iOS palette, Geist type, money and date rules, motion, both themes. Load before building or restyling any page, card, dialog or chart in this app.
---

# KG Finance — UI/UX standard

This app is a private, mobile-first finance tracker for two people. Every screen is
scanned on a phone in a few seconds, usually to answer one question: *how much, and
who*. Design for that. Big number first, quiet labels, nothing decorative.

Precedence: the user's words → this file → your own taste.

## 1. Use what exists before writing new

| Need | Use | Where |
|---|---|---|
| A card | `GlassCard` | `components/ui/glass-card` |
| A page with title + action | `CompactPageShell` | `components/ui/compact-page-shell` |
| Stat tiles | `CompactStat`, `CompactStatGrid` | same file |
| A dialog | `GlassModal` + `GlassButton` | `components/ui/glass-modal`, `glass-button` |
| Destructive confirm | `ConfirmDialog` | `components/ui/confirm-dialog` |
| Animated money | `AnimatedMoney` | `components/ui/animated-number` |
| Person switch | `PersonTabs` | `components/ui/person-tabs` |
| Single-series chart | `FlexChart` | `components/charts/flex-chart` |
| Stacked / multi-series | `StackedChart` | `components/charts/stacked-chart` |
| Chart type picker | `ChartTypePicker` + `useChartType` | `components/dashboard/chart-type-picker` |
| Icons | `lucide-react` only | sizes `h-3`, `h-3.5`, `h-4` |

Do not hand-roll a card, modal, or button. If a component is missing something, extend it.

## 2. Tokens — never literals

Everything derives from `src/app/globals.css`. Use the class or the variable; never
paste a hex that only works in one theme.

```
--background   #f2f2f7 light · #000000 dark
--foreground   #1c1c1e light · #f5f5f7 dark
--glass-bg     rgba(255,255,255,.72) · rgba(44,44,46,.72)
--glass-border rgba(255,255,255,.8)   · rgba(255,255,255,.12)
--glass-shadow 0 8px 32px rgba(0,0,0,.08) · .4
--muted        rgba(60,60,67,.6)      · rgba(235,235,245,.6)
--card-radius  20px
--blur         24px   (with saturate(180%))
```

Semantic colour is fixed by **role**, and a role never borrows another's colour:

| Role | Hex | Used for |
|---|---|---|
| Accent | `#007aff` | primary actions, selected state, links |
| Indigo | `#5856d6` | secondary accent, gradients |
| Purple | `#af52de` | Memory, assistant, Jarvis |
| Income / good | `#34c759` | income, available balance, success |
| Warning / pending | `#ff9500` | reminders, tips pending, due soon |
| Debt / danger | `#ff3b30` | debt, delete, owed |
| Amazon Flex | `#0077FF` (`FLEX_BLUE`) | the Flex page only |
| Shared badge | `#5ac8fa` | "SHARED" pill on accounts |

Signature gradient (logo, splash, Jarvis): `linear-gradient(135deg, #007aff, #5856d6, #af52de)`.

**Both themes, always.** Light and dark are both real. Use `dark:` variants for any
literal you must write (`bg-black/[0.03] dark:bg-white/[0.04]`). Check the page in
both before calling it done.

## 3. Type

Geist Sans for everything, Geist Mono only for code. The scale is small and tight —
this is a phone app, not a brochure:

| Role | Class |
|---|---|
| Page title | `text-lg font-bold leading-tight` |
| Headline number | `text-2xl` or `text-3xl font-semibold tabular-nums` |
| Card heading | `text-xs font-semibold` |
| Body / row | `text-[12px]` – `text-[13px]` |
| Label above a value | `text-[10px] uppercase tracking-wide text-muted` |
| Helper / footnote | `text-[10px]` – `text-[11px] text-muted` |
| Row secondary line | `text-[10px] text-muted` |

Every figure that sits in a column gets `tabular-nums`. Never use a serif. Never
centre body text; centre only a headline number and its label.

The one exception is the wordmark: "KG Finance" itself is Cinzel, KG at 800 and
Finance at 400, chosen by the owners. Always render it with `<Wordmark />` from
`components/brand/wordmark` (pass `enter` for its blur-to-focus entrance), next to
the lion (`KgMark`). Never set anything else in Cinzel.

## 4. Money and dates — non-negotiable

- Format money with `formatCurrency` from `lib/formatters`. Never `toFixed(2)` by hand.
- Round with `roundMoney`; split with `splitMoney`. Never round per step in a running
  balance — the shared-balance total is cent-exact for a reason.
- Dates: `formatDate` → `MM/DD/YYYY`. Times: `formatTime` / `formatClock` → `hh:mm AM/PM`.
- Today is `zonedToday()` from `lib/zoned-date` (America/Chicago). **Never**
  `new Date().toISOString().slice(0,10)` — after 7pm Central that is tomorrow.
- Rates are recomputed from totals, never summed (`$21 + $21 + $22` is not `$64/hour`).
- Never write a transaction, balance, or income record without the user's explicit
  confirmation. See `lib/ai/*` for the consent rules — they exist because of a real
  phantom-expense incident.

## 5. Layout

- Mobile first. Content column is `max-w-lg mx-auto` (512px). Design at 390px wide.
- Sections stack with `space-y-3`; inside a card use `gap-2` grids, never stacked margins.
- Stat tiles come in twos or threes: `grid grid-cols-2 gap-2` / `grid-cols-3`.
- Tiles use `rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]` — a tile is
  lighter than a card; only the card carries glass, border and shadow.
- Segmented controls: `glass flex gap-0.5 rounded-lg p-0.5`, selected button gets
  `text-white` with the role colour as background.
- Bottom nav is fixed; leave `pb-2` on pages and never put a primary action under it.
- Lists group by the unit a person thinks in (a day of blocks, a month of bills), one
  row per group, expandable. Never a flat list longer than seven rows without a
  "Show all N" control.
- Long text scrolls in its own box (`overflow-x-auto`); the page never scrolls sideways.

## 6. State and empty states

- Every list has an empty state, in words a person would say: *"No blocks logged yet.
  Tap 'Log a block', or just tell Jarvis."* Not "No data".
- Distinguish **empty** from **nothing in this window**: a filtered view that hides
  data says so and offers the way out ("Nothing this week — step back").
- Pending things are orange, in the row, not in a banner.
- Never open on an empty screen when data exists elsewhere — pick the tightest
  window that has content.
- Save buttons are disabled until the form is valid, and say what they do: "Save 3",
  "Delete block", never "OK".

## 7. Motion

`motion` (import from `"motion/react"`) is installed. Use it where CSS cannot:
staggered entrances, expand/collapse with layout, exit animations via `AnimatePresence`.

- Page load: sections fade up with a 50ms stagger — `CompactPageShell` already does this.
- Duration 0.35–0.45s, ease `[0.16, 1, 0.3, 1]`. Nothing bounces.
- Always honour `useReducedMotion()` — skip to the resting state.
- Nothing meant to be read starts invisible waiting on scroll. Load animations only.
- Money changes go through `AnimatedMoney`; don't add a second counting animation.
- Hover states on touch targets: subtle `bg-black/[0.03] dark:bg-white/[0.04]`, no scale.

## 8. Copy

- Name things as people say them: "Base pay", "Tips", "Who owes whom" — not field keys.
- People are `OWNER_LABEL` / `MEMBER_LABEL` from `lib/branding`, never a hard-coded
  name. No hearts, no pet names, no relationship wording — `branding.ts` owns names.
- Confirmations say what will happen: *"The 09/05 block and its earnings will be removed."*
- Errors say what to do next. No apologies.

## 9. Before you say it's done

- [ ] Looked at it in dark **and** light
- [ ] Looked at it at 390px wide
- [ ] Every money figure through `formatCurrency`, every date `MM/DD/YYYY`
- [ ] Empty state written, filtered-empty state written
- [ ] Zero console errors on a fresh tab
- [ ] `npx tsc --noEmit` clean; `npx eslint <files you touched>` clean
- [ ] Nothing hard-coded that `branding.ts` or `globals.css` already owns
