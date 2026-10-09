import { getAccountsForPerson } from "@/lib/accounts";
import {
  getAvailableCredit,
  getCreditUtilization,
  getIncomeForPeriod,
  getPersonDebtOutstandingSummary,
  getPersonExpensesForPeriod,
  getTransactionExpenseShare,
  sumPersonExpenses,
} from "@/lib/calculations";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { buildLearnedCategorySpending } from "@/lib/learn-spending-categories";
import { roundMoney } from "@/lib/money";
import { COUNTRY_META, formatForeign, remittanceTotals, sortNewestFirst } from "@/lib/remittances";
import { upcomingFor, whenLabel } from "@/lib/upcoming";
import type { Reminder } from "@/lib/ai/reminders";
import { PERSON_LABELS, type FinanceState, type Person } from "@/types";

/**
 * The money map the assistant workspace draws: one person's finances as a
 * universe — the person at the centre, seven hubs around them, and every
 * account, category, source, debt, bill and transfer as a node on a hub.
 *
 * Every figure comes from the same helpers the rest of the app uses
 * (Home's category spending, Accounts' balances, Debts' summary, the bills
 * strip), so the map can never disagree with the page a node links to.
 * Pure: built from a state snapshot and a date, nothing else.
 *
 * It also answers the two questions the animation needs while the assistant
 * works: which hubs a tool call is reading (TOOL_HUBS), and which nodes its
 * answer is about (leavesMentioned).
 */

export type HubKey = "accounts" | "spending" | "income" | "debts" | "bills" | "transfers" | "balance";
export type Tone = "good" | "warn" | "bad" | "neutral";

export const HUB_ORDER: readonly HubKey[] = ["spending", "income", "accounts", "bills", "debts", "transfers", "balance"];

export interface GraphLeaf {
  id: string;
  hub: HubKey;
  label: string;
  /** Size of the node: dollars, whatever the hub measures. */
  value: number;
  valueText: string;
  tone: Tone;
  /** 0–1 fill of the status bar (budget used, card used); null for none. */
  meter: number | null;
  meterText?: string;
  note?: string;
  href: string;
  /** What to ask the assistant about this node. */
  prompt: string;
}

export interface GraphChip {
  key: string;
  label: string;
  count: number;
  leafIds: string[];
}

export interface GraphStat {
  label: string;
  value: string;
}

export interface GraphHub {
  key: HubKey;
  label: string;
  headline: number;
  headlineText: string;
  caption: string;
  tone: Tone;
  badge?: { text: string; tone: Tone };
  /** Against last month, when there is one: "+12% vs September". */
  delta?: { text: string; tone: Tone };
  /** The dot-matrix chart's values, oldest first. */
  series: number[];
  seriesLabel: string;
  stats: GraphStat[];
  chips: GraphChip[];
  leaves: GraphLeaf[];
  href: string;
  prompt: string;
}

export interface FinanceGraph {
  person: Person;
  core: { label: string; headlineText: string; caption: string };
  monthLabel: string;
  hubs: GraphHub[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthBounds(year: number, monthIndex: number) {
  return {
    start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
  };
}

function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

/** "+12% vs September" — up is good for income, bad for spending. */
function deltaAgainst(now: number, before: number, monthName: string, upIsGood: boolean): GraphHub["delta"] {
  if (before <= 0) return undefined;
  const change = ((now - before) / before) * 100;
  const rounded = Math.round(change);
  const tone: Tone = Math.abs(change) < 3 ? "neutral" : change > 0 === upIsGood ? "good" : "warn";
  return { text: `${rounded > 0 ? "+" : ""}${rounded}% vs ${monthName}`, tone };
}

function chip(key: string, label: string, leaves: GraphLeaf[]): GraphChip {
  return { key, label, count: leaves.length, leafIds: leaves.map((leaf) => leaf.id) };
}

/** Chips with nothing in them are left out, except the first: "all" always shows. */
function chips(...list: GraphChip[]): GraphChip[] {
  return list.filter((item, index) => index === 0 || item.count > 0);
}

function analyse(subject: string): string {
  return `Give me a short analysis of ${subject}: what stands out, how it compares with last month, and anything I should act on.`;
}

export function buildFinanceGraph({
  state,
  reminders,
  person,
  today,
}: {
  state: FinanceState;
  reminders: Reminder[];
  person: Person;
  /** yyyy-MM-dd in the app's time zone. */
  today: string;
}): FinanceGraph {
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const dayOfMonth = Number(today.slice(8, 10));
  const month = monthBounds(year, monthIndex);
  const prevIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prev = monthBounds(monthIndex === 0 ? year - 1 : year, prevIndex);
  const monthName = MONTHS[monthIndex]!;
  const prevName = MONTHS[prevIndex]!;
  const monthLabel = `${monthName} ${year}`;
  const now = new Date(year, monthIndex, dayOfMonth, 12);

  /**
   * The last 30 days, today last. A rolling window rather than the month so
   * far, so the strip has a shape on the 2nd of the month as well as the 28th.
   */
  const windowStart = new Date(year, monthIndex, dayOfMonth - 29, 0, 0, 0, 0);
  const windowEnd = new Date(year, monthIndex, dayOfMonth, 23, 59, 59, 999);
  const pad = (n: number) => String(n).padStart(2, "0");
  const windowDays = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(year, monthIndex, dayOfMonth - 29 + i);
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  });
  const daily = (entries: { date: string; amount: number }[]) => {
    const slot = new Map(windowDays.map((day, index) => [day, index]));
    const out = Array.from({ length: 30 }, () => 0);
    for (const entry of entries) {
      const index = slot.get(entry.date);
      if (index !== undefined) out[index]! += entry.amount;
    }
    return out.map(roundMoney);
  };

  /* ---------------- Spending ---------------- */
  const expenses = getPersonExpensesForPeriod(state.transactions, person, month.start, month.end);
  const learned = buildLearnedCategorySpending(state.transactions, person, state.spendCategories, expenses, month.start, month.end);
  const spendTotal = roundMoney(
    learned.spent.reduce((sum, row) => sum + row.amount, 0) +
      learned.offsets.reduce((sum, row) => sum + row.amount, 0) +
      learned.unmapped
  );
  const spendPrev = roundMoney(sumPersonExpenses(state.transactions, person, prev.start, prev.end));
  const spendLeaves: GraphLeaf[] = learned.spent.map((row) => {
    const budget = state.spendCategories.find((category) => category.name === row.name)?.budget;
    const used = budget && budget > 0 ? row.amount / budget : null;
    return {
      id: `spending:${slug(row.name)}`,
      hub: "spending",
      label: row.name,
      value: row.amount,
      valueText: formatCurrency(roundMoney(row.amount)),
      tone: used === null ? "neutral" : used >= 1 ? "bad" : used >= 0.8 ? "warn" : "good",
      meter: used === null ? null : Math.min(used, 1),
      meterText: used === null ? "No budget" : `${Math.round(used * 100)}% of ${formatCurrency(budget!)}`,
      note: monthName,
      href: `/history?type=expense&person=${person}&category=${encodeURIComponent(row.name)}`,
      prompt: analyse(`my ${row.name} spending in ${monthName}`),
    };
  });
  const overBudget = spendLeaves.filter((leaf) => leaf.tone === "bad" || leaf.tone === "warn");
  const spending: GraphHub = {
    key: "spending",
    label: "Spending",
    headline: spendTotal,
    headlineText: formatCurrency(spendTotal),
    caption: `${monthName} · ${spendLeaves.length} ${spendLeaves.length === 1 ? "category" : "categories"}`,
    tone: overBudget.some((leaf) => leaf.tone === "bad") ? "bad" : overBudget.length ? "warn" : "neutral",
    badge: overBudget.length
      ? { text: `${overBudget.length} near or over budget`, tone: overBudget.some((leaf) => leaf.tone === "bad") ? "bad" : "warn" }
      : spendPrev > 0 && spendTotal > spendPrev
        ? { text: `Above ${prevName}`, tone: "warn" }
        : { text: "On track", tone: "good" },
    delta: deltaAgainst(spendTotal, spendPrev, prevName, false),
    series: daily(
      getPersonExpensesForPeriod(state.transactions, person, windowStart, windowEnd).map((tx) => ({
        date: tx.date,
        amount: getTransactionExpenseShare(tx, person),
      }))
    ),
    seriesLabel: "Last 30 days",
    stats: [
      { label: "Categories", value: String(spendLeaves.length) },
      { label: "Spends", value: String(expenses.length) },
      { label: "Near or over budget", value: String(overBudget.length) },
      { label: "Biggest", value: spendLeaves[0]?.label ?? "—" },
    ],
    chips: chips(
      chip("all", "Categories", spendLeaves),
      chip("over", "Near or over budget", overBudget),
      chip("budgeted", "Budgeted", spendLeaves.filter((leaf) => leaf.meter !== null)),
      chip("open", "No budget", spendLeaves.filter((leaf) => leaf.meter === null))
    ),
    leaves: spendLeaves,
    href: "/",
    prompt: analyse(`my spending in ${monthName}`),
  };

  /* ---------------- Income ---------------- */
  const sourceNames = Object.fromEntries(state.incomeSources.map((source) => [source.id, source.name]));
  const incomeEntries = getIncomeForPeriod(state.incomeEntries, person, month.start, month.end);
  const incomePrev = roundMoney(
    getIncomeForPeriod(state.incomeEntries, person, prev.start, prev.end).reduce((sum, entry) => sum + entry.amount, 0)
  );
  const bySource = new Map<string, { amount: number; count: number }>();
  for (const entry of incomeEntries) {
    const name = sourceNames[entry.sourceId] ?? "Unknown";
    const row = bySource.get(name) ?? { amount: 0, count: 0 };
    row.amount += entry.amount;
    row.count += 1;
    bySource.set(name, row);
  }
  const incomeLeaves: GraphLeaf[] = [...bySource.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([name, row]) => ({
      id: `income:${slug(name)}`,
      hub: "income",
      label: name,
      value: row.amount,
      valueText: formatCurrency(roundMoney(row.amount)),
      tone: "good",
      meter: null,
      note: `${row.count} ${row.count === 1 ? "deposit" : "deposits"}`,
      href: "/accounts",
      prompt: analyse(`my ${name} income in ${monthName}`),
    }));
  const incomeTotal = roundMoney(incomeLeaves.reduce((sum, leaf) => sum + leaf.value, 0));
  const income: GraphHub = {
    key: "income",
    label: "Income",
    headline: incomeTotal,
    headlineText: formatCurrency(incomeTotal),
    caption: `${monthName} · ${incomeLeaves.length} ${incomeLeaves.length === 1 ? "source" : "sources"}`,
    tone: incomeTotal > 0 ? "good" : "neutral",
    badge:
      incomePrev > 0
        ? incomeTotal >= incomePrev
          ? { text: `Ahead of ${prevName}`, tone: "good" }
          : { text: `Behind ${prevName}`, tone: "warn" }
        : undefined,
    delta: deltaAgainst(incomeTotal, incomePrev, prevName, true),
    series: daily(
      getIncomeForPeriod(state.incomeEntries, person, windowStart, windowEnd).map((entry) => ({
        date: entry.date,
        amount: entry.amount,
      }))
    ),
    seriesLabel: "Last 30 days",
    stats: [
      { label: "Sources", value: String(incomeLeaves.length) },
      { label: "Deposits", value: String(incomeEntries.length) },
      { label: "Biggest", value: incomeLeaves[0]?.label ?? "—" },
      { label: prevName, value: formatCurrency(incomePrev) },
    ],
    chips: chips(chip("all", "Sources", incomeLeaves)),
    leaves: incomeLeaves,
    href: "/accounts",
    prompt: analyse(`my income in ${monthName}`),
  };

  /* ---------------- Accounts ---------------- */
  const mine = getAccountsForPerson(state.accounts, person);
  const accountLeaves: GraphLeaf[] = [...mine]
    .sort((a, b) => Number(a.type === "credit") - Number(b.type === "credit") || b.balance - a.balance)
    .map((account) => {
      const card = account.type === "credit";
      const used = card && account.creditLimit ? getCreditUtilization(account) / 100 : null;
      return {
        id: `accounts:${account.id}`,
        hub: "accounts",
        label: account.name,
        value: Math.abs(account.balance),
        valueText: formatCurrency(account.balance),
        tone: card
          ? used === null
            ? account.balance > 0 ? "warn" : "good"
            : used >= 0.9 ? "bad" : used >= 0.5 ? "warn" : "good"
          : account.balance > 0 ? "good" : account.balance < 0 ? "bad" : "neutral",
        meter: used === null ? null : Math.min(used, 1),
        meterText: used === null ? undefined : `${Math.round(used * 100)}% used · ${formatCurrency(getAvailableCredit(account))} left`,
        note: card ? "Card · owed" : account.type === "cash" ? "Cash" : "Bank",
        href: card ? "/debts" : "/accounts",
        prompt: analyse(`my ${account.name} account`),
      };
    });
  const available = roundMoney(mine.filter((a) => a.type !== "credit").reduce((sum, a) => sum + a.balance, 0));
  const owed = roundMoney(mine.filter((a) => a.type === "credit").reduce((sum, a) => sum + a.balance, 0));
  const accounts: GraphHub = {
    key: "accounts",
    label: "Accounts",
    headline: available,
    headlineText: formatCurrency(available),
    caption: `Available · ${mine.length} ${mine.length === 1 ? "account" : "accounts"}`,
    tone: owed > available ? "bad" : "good",
    badge: owed > available ? { text: "Cards exceed cash", tone: "bad" } : { text: "Cash covers cards", tone: "good" },
    series: accountLeaves.map((leaf) => leaf.value),
    seriesLabel: "Each account",
    stats: [
      { label: "Available", value: formatCurrency(available) },
      { label: "Owed on cards", value: formatCurrency(owed) },
      { label: "Bank & cash", value: String(mine.filter((a) => a.type !== "credit").length) },
      { label: "Cards", value: String(mine.filter((a) => a.type === "credit").length) },
    ],
    chips: chips(
      chip("all", "Accounts", accountLeaves),
      chip("money", "Bank & cash", accountLeaves.filter((leaf) => leaf.note !== "Card · owed")),
      chip("cards", "Cards", accountLeaves.filter((leaf) => leaf.note === "Card · owed"))
    ),
    leaves: accountLeaves,
    href: "/accounts",
    prompt: analyse("my accounts and cards"),
  };

  /* ---------------- Debts ---------------- */
  const debtSummary = getPersonDebtOutstandingSummary(state.debts, person);
  const debtLeaves: GraphLeaf[] = [...debtSummary.activeDebts]
    .sort((a, b) => b.amount - a.amount)
    .map((debt) => ({
      id: `debts:${debt.id}`,
      hub: "debts",
      label: debt.name,
      value: debt.amount,
      valueText: formatCurrency(debt.amount),
      tone: "bad",
      meter: null,
      note: debt.linkedAccountId ? "Card bill" : "Owed to someone",
      href: "/debts",
      prompt: analyse(`what I owe on ${debt.name}`),
    }));
  const debtTotal = roundMoney(debtSummary.total);
  const debts: GraphHub = {
    key: "debts",
    label: "Debts",
    headline: debtTotal,
    headlineText: formatCurrency(debtTotal),
    caption: `${debtLeaves.length} open`,
    tone: debtLeaves.length ? "bad" : "good",
    badge: debtLeaves.length ? { text: `${debtLeaves.length} open`, tone: "bad" } : { text: "Debt-free", tone: "good" },
    series: debtLeaves.map((leaf) => leaf.value),
    seriesLabel: "Each debt",
    stats: [
      { label: "Open", value: String(debtLeaves.length) },
      { label: "Card bills", value: String(debtSummary.creditCardBills) },
      { label: "Loans & IOUs", value: String(debtLeaves.length - debtSummary.creditCardBills) },
      { label: "Largest", value: debtLeaves[0]?.label ?? "—" },
    ],
    chips: chips(
      chip("all", "Debts", debtLeaves),
      chip("loans", "Loans & IOUs", debtLeaves.filter((leaf) => leaf.note !== "Card bill")),
      chip("cards", "Card bills", debtLeaves.filter((leaf) => leaf.note === "Card bill"))
    ),
    leaves: debtLeaves,
    href: "/debts",
    prompt: analyse("my debts"),
  };

  /* ---------------- Bills ---------------- */
  const upcoming = upcomingFor(state.monthlyExpenses, state.transactions, reminders, person, 31, now);
  const billLeaves: GraphLeaf[] = upcoming.map((item) => ({
    id: `bills:${item.key}`,
    hub: "bills",
    label: item.name,
    value: item.amount ?? 0,
    valueText: item.amount != null ? formatCurrency(item.amount) : whenLabel(item.daysUntil),
    tone: item.daysUntil <= 0 ? "bad" : item.daysUntil <= 3 ? "warn" : "neutral",
    meter: null,
    note: `${item.kind === "bill" ? "Bill" : "Reminder"} · ${whenLabel(item.daysUntil)}`,
    href: "/memory",
    prompt: analyse(`my upcoming ${item.name}`),
  }));
  const dueNow = billLeaves.filter((leaf) => leaf.tone === "bad");
  const dueWeek = upcoming.filter((item) => item.daysUntil <= 7);
  const dueAmount = roundMoney(dueWeek.reduce((sum, item) => sum + (item.amount ?? 0), 0));
  const billSeries = Array.from({ length: 31 }, () => 0);
  for (const item of upcoming) {
    const slot = Math.min(Math.max(item.daysUntil, 0), 30);
    billSeries[slot]! += item.amount ?? 1;
  }
  const bills: GraphHub = {
    key: "bills",
    label: "Bills",
    headline: dueWeek.length,
    headlineText: `${dueWeek.length} due`,
    caption: "In the next 7 days",
    tone: dueNow.length ? "bad" : dueWeek.length ? "warn" : "good",
    badge: dueNow.length
      ? { text: "Due today", tone: "bad" }
      : dueWeek.length
        ? { text: "Due soon", tone: "warn" }
        : { text: "All clear", tone: "good" },
    series: billSeries.map(roundMoney),
    seriesLabel: "Next 31 days",
    stats: [
      { label: "This week", value: String(dueWeek.length) },
      { label: "Later this month", value: String(upcoming.length - dueWeek.length) },
      { label: "Due today", value: String(dueNow.length) },
      { label: "Due this week", value: formatCurrency(dueAmount) },
    ],
    chips: chips(
      chip("all", "Upcoming", billLeaves),
      chip("week", "This week", billLeaves.filter((_, index) => upcoming[index]!.daysUntil <= 7)),
      chip("reminders", "Reminders", billLeaves.filter((_, index) => upcoming[index]!.kind === "reminder"))
    ),
    leaves: billLeaves,
    href: "/memory",
    prompt: analyse("my bills and reminders coming up"),
  };

  /* ---------------- Money transfers ---------------- */
  const sent = (state.remittances ?? []).filter((transfer) => transfer.person === person);
  const sentTotals = remittanceTotals(sent);
  const transferLeaves: GraphLeaf[] = (["IN", "PH"] as const)
    .filter((code) => sentTotals.byCountry[code].count > 0)
    .map((code) => {
      const row = sentTotals.byCountry[code];
      const meta = COUNTRY_META[code];
      return {
        id: `transfers:${code}`,
        hub: "transfers",
        label: meta.name,
        value: row.usdSent,
        valueText: formatCurrency(row.usdSent),
        tone: "neutral",
        meter: null,
        note: `${formatForeign(row.received, meta.currency)} received · ${row.count} sent`,
        href: "/transfers",
        prompt: analyse(`the money I sent to ${meta.name}`),
      };
    });
  const lastTransfer = sortNewestFirst(sent)[0];
  const monthsBack = Array.from({ length: 12 }, () => 0);
  for (const transfer of sent) {
    const age = (year - Number(transfer.date.slice(0, 4))) * 12 + monthIndex - (Number(transfer.date.slice(5, 7)) - 1);
    if (age >= 0 && age < 12) monthsBack[11 - age]! += transfer.usdAmount;
  }
  const transfers: GraphHub = {
    key: "transfers",
    label: "Transfers",
    headline: sentTotals.usdSent,
    headlineText: formatCurrency(sentTotals.usdSent),
    caption: `Sent abroad · ${sentTotals.count} ${sentTotals.count === 1 ? "transfer" : "transfers"}`,
    tone: "neutral",
    badge: lastTransfer ? { text: `Last ${formatDate(lastTransfer.date)}`, tone: "neutral" } : undefined,
    series: monthsBack.map(roundMoney),
    seriesLabel: "Last 12 months",
    stats: [
      { label: "USD sent", value: formatCurrency(sentTotals.usdSent) },
      { label: "INR received", value: formatForeign(sentTotals.byCountry.IN.received, "INR") },
      { label: "PHP received", value: formatForeign(sentTotals.byCountry.PH.received, "PHP") },
      { label: "Fees", value: formatCurrency(sentTotals.fees) },
    ],
    chips: chips(chip("all", "Countries", transferLeaves)),
    leaves: transferLeaves,
    href: "/transfers",
    prompt: analyse("the money I've sent to India and the Philippines"),
  };

  /* ---------------- Balance between the two ---------------- */
  const between = roundMoney(state.settlementBalance);
  const creditor: Person | null = between > 0 ? "kushvanth" : between < 0 ? "g" : null;
  const debtor: Person | null = creditor === "kushvanth" ? "g" : creditor === "g" ? "kushvanth" : null;
  const balanceText =
    creditor && debtor ? `${PERSON_LABELS[debtor]} owes ${PERSON_LABELS[creditor]}` : "All square";
  const balanceLeaves: GraphLeaf[] = (["kushvanth", "g"] as const).map((who) => ({
    id: `balance:${who}`,
    hub: "balance",
    label: PERSON_LABELS[who],
    value: Math.abs(between),
    valueText: who === creditor ? `Owed ${formatCurrency(Math.abs(between))}` : who === debtor ? `Owes ${formatCurrency(Math.abs(between))}` : formatCurrency(0),
    tone: who === creditor ? "good" : who === debtor ? "warn" : "neutral",
    meter: null,
    href: "/balance",
    prompt: analyse(`what ${PERSON_LABELS[who]} paid and owes in the shared balance`),
  }));
  const history = [...(state.settlementHistory ?? [])].slice(0, 30).reverse();
  const balance: GraphHub = {
    key: "balance",
    label: "Balance",
    headline: Math.abs(between),
    headlineText: formatCurrency(Math.abs(between)),
    caption: balanceText,
    tone: creditor === person ? "good" : debtor === person ? "warn" : "good",
    badge: { text: balanceText, tone: creditor === person ? "good" : debtor === person ? "warn" : "good" },
    series: history.map((entry) => Math.abs(entry.runningBalance)),
    seriesLabel: "Last 30 changes",
    stats: [
      { label: "Balance", value: formatCurrency(Math.abs(between)) },
      { label: "Who owes", value: debtor ? PERSON_LABELS[debtor] : "Nobody" },
      { label: "Changes", value: String(state.settlementHistory?.length ?? 0) },
      { label: "Last change", value: state.settlementHistory?.[0] ? formatDate(state.settlementHistory[0].date) : "—" },
    ],
    chips: chips(chip("all", "People", balanceLeaves)),
    leaves: balanceLeaves,
    href: "/balance",
    prompt: analyse("the shared balance between us"),
  };

  const byKey: Record<HubKey, GraphHub> = { spending, income, accounts, bills, debts, transfers, balance };
  return {
    person,
    core: { label: PERSON_LABELS[person], headlineText: formatCurrency(available), caption: `available · ${monthLabel}` },
    monthLabel,
    hubs: HUB_ORDER.map((key) => byKey[key]),
  };
}

/* ------------------------------------------------------------------ */
/* What the assistant is touching                                       */
/* ------------------------------------------------------------------ */

/** Which hubs each assistant tool reads or writes. Tools not listed touch the centre only. */
export const TOOL_HUBS: Record<string, HubKey[]> = {
  list_accounts: ["accounts"],
  add_account: ["accounts"],
  adjust_account_balance: ["accounts"],
  calculate_net_worth: ["accounts", "debts"],
  record_expense: ["spending", "accounts"],
  preview_expense_split: ["spending", "balance"],
  calculate_category_breakdown: ["spending"],
  list_spend_categories: ["spending"],
  update_spend_category: ["spending"],
  delete_spend_category: ["spending"],
  calculate_monthly_summary: ["spending", "income"],
  record_income: ["income", "accounts"],
  list_income_sources: ["income"],
  update_income_source: ["income"],
  delete_income_source: ["income"],
  add_debt: ["debts"],
  update_debt: ["debts"],
  delete_debt: ["debts"],
  record_debt_payment: ["debts", "accounts"],
  pay_debt_from_account: ["debts", "accounts"],
  list_reminders: ["bills"],
  save_reminder: ["bills"],
  update_reminder: ["bills"],
  delete_reminder: ["bills"],
  mark_reminder_done: ["bills"],
  get_daily_briefing: ["bills", "spending", "accounts"],
  calculate_between_us_balance: ["balance"],
};

export function hubsForTools(names: string[]): HubKey[] {
  const out = new Set<HubKey>();
  for (const name of names) for (const hub of TOOL_HUBS[name] ?? []) out.add(hub);
  return [...out];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Nodes named in a piece of text — an answer, or a tool call's arguments —
 * by their label, as a whole word, ignoring case. Labels under three letters
 * are skipped: "G" would match half of every sentence.
 */
export function leavesMentioned(graph: FinanceGraph, text: string): string[] {
  if (!text.trim()) return [];
  const found: string[] = [];
  for (const hub of graph.hubs) {
    for (const leaf of hub.leaves) {
      const label = leaf.label.trim();
      if (label.length < 3) continue;
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(label)}($|[^\\p{L}\\p{N}])`, "iu").test(text)) found.push(leaf.id);
    }
  }
  return found;
}

/**
 * Hubs a question or answer is about, by the words people use for them —
 * "spent", "earned", "owe", "due", "India". Lights the right part of the map
 * the moment a question is sent, before any tool has run.
 */
const HUB_WORDS: Record<HubKey, RegExp> = {
  spending: /\b(spen[dt]|spending|expenses?|categor(y|ies)|budget|bought|groceries|food)\b/i,
  income: /\b(income|earn(ed|ings)?|paid me|salary|deposits?|tips?)\b/i,
  accounts: /\b(accounts?|cards?|bank|cash|available|green ?dot|chime|bofa)\b/i,
  bills: /\b(bills?|reminders?|due|rent|subscriptions?)\b/i,
  debts: /\b(debts?|loans?|owe to|pay off|iou)\b/i,
  transfers: /\b(transfers?|remit(tance)?s?|sent (to )?(india|home|philippines)|india|philippines|rupees?|pesos?)\b/i,
  balance: /\b(who owes|owes? (me|you|him|her)|between us|shared balance|settle(ment)?)\b/i,
};

export function hubsMentioned(text: string): HubKey[] {
  return HUB_ORDER.filter((key) => HUB_WORDS[key].test(text));
}

/** Every string inside a tool call's arguments, one level of nesting deep. */
export function argumentText(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const value of Object.values(args)) {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) parts.push(...value.filter((item): item is string => typeof item === "string"));
    else if (value && typeof value === "object") {
      parts.push(...Object.values(value).filter((item): item is string => typeof item === "string"));
    }
  }
  return parts.join(" · ");
}
