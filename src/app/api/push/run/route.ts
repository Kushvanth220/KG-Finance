import { NextResponse } from "next/server";
import webpush from "web-push";
import {
  deletePushSubscription,
  fetchAssistantPreferences,
  fetchWorkspaceFinance,
  fetchWorkspaceRules,
  listPushSubscriptions,
} from "@/lib/ai/chat-store";
import { findFlexRule } from "@/lib/flex";
import { blocksAwaitingTips, expectedPayouts } from "@/lib/flex-deposits";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import { dueLabel, isDueSoon, reminderFromLegacyLine, type Reminder } from "@/lib/ai/reminders";
import { getDueDateForExpense, getMonthlyExpensePaid } from "@/lib/monthly-expense-tracker";
import { zonedToday } from "@/lib/zoned-date";
import { formatCurrency } from "@/lib/formatters";
import type { FlexDeposit, IncomeEntry, MonthlyExpense, Transaction } from "@/types";

export const dynamic = "force-dynamic";

/**
 * The daily nudge. Vercel's cron calls this once a morning (see vercel.json);
 * it works out what is due for the workspace and pushes one notification to
 * every device that asked for them.
 *
 * Reminders are read from the same rendered lines the app syncs, so a snooze
 * or a "done" made on either phone is respected here without any extra state.
 */

const BILL_DAYS_AHEAD = 3;
/** Tips usually land within a day or so; after this long they are worth a nudge. */
const TIP_CHASE_HOURS = 48;

interface Due {
  text: string;
  person: string | null;
}

function dueToday(): { iso: string; date: Date } {
  const iso = zonedToday();
  return { iso, date: new Date(`${iso}T00:00:00`) };
}

function dueReminders(lines: string[], today: Date): Due[] {
  return lines
    .map((line, i) => reminderFromLegacyLine(line, `r${i}`))
    .filter((reminder: Reminder) => isDueSoon(reminder, today))
    .map((reminder) => ({
      text: `${reminder.text} — ${dueLabel(reminder, today).toLowerCase()}`,
      person: reminder.person ?? null,
    }));
}

function dueBills(bills: MonthlyExpense[], transactions: Transaction[], today: Date): Due[] {
  const todayStart = today.getTime();
  const out: Due[] = [];
  for (const bill of bills) {
    if (!bill.amount) continue;
    const due = getDueDateForExpense(bill, today);
    if (!due) continue;
    const days = Math.round(
      (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - todayStart) / 86400000
    );
    if (days < 0 || days > BILL_DAYS_AHEAD) continue;
    if (!bill.isRecurring && bill.isPaid) continue;
    if (bill.isRecurring && getMonthlyExpensePaid(transactions, bill, today) >= bill.amount) continue;
    const when = days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;
    out.push({ text: `${bill.name} ${formatCurrency(bill.amount)} — ${when}`, person: bill.person });
  }
  return out;
}

/** Blocks whose tips are still blank two days on, and a payout landing today. */
function flexNudges(
  rules: Rule[],
  entries: RuleEntry[],
  deposits: FlexDeposit[],
  incomeEntries: IncomeEntry[],
  todayIso: string,
  now: Date
): Due[] {
  const rule = findFlexRule(rules);
  if (!rule) return [];
  const out: Due[] = [];

  const waiting = blocksAwaitingTips(rule, entries, TIP_CHASE_HOURS, now);
  if (waiting.length > 0) {
    const days = waiting
      .slice(0, 3)
      .map((entry) => new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }));
    out.push({
      text: `Tips still blank on ${waiting.length} Flex ${waiting.length === 1 ? "block" : "blocks"} (${days.join(", ")}${waiting.length > 3 ? ", …" : ""})`,
      person: "kushvanth",
    });
  }

  if (rule.payout.accountId && rule.payout.postFrom) {
    const landing = expectedPayouts(rule, entries, deposits, incomeEntries, rule.payout.postFrom, todayIso).find(
      (payout) => payout.date === todayIso
    );
    if (landing) {
      out.push({
        text: rule.payout.autoPost
          ? `Flex payout ${formatCurrency(landing.total)} written today — check it matches the bank`
          : `Flex should pay ${formatCurrency(landing.total)} today — tap Landed when it shows`,
        person: "kushvanth",
      });
    }
  }
  return out;
}

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@example.com";
  if (!publicKey || !privateKey) {
    return NextResponse.json({ ok: false, error: "VAPID keys are not configured." }, { status: 503 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    const { iso, date } = dueToday();
    const [prefs, finance, subscriptions, rulesDoc] = await Promise.all([
      fetchAssistantPreferences(),
      fetchWorkspaceFinance() as Promise<{
        monthlyExpenses?: MonthlyExpense[];
        transactions?: Transaction[];
        incomeEntries?: IncomeEntry[];
        flexDeposits?: FlexDeposit[];
      } | null>,
      listPushSubscriptions(),
      fetchWorkspaceRules().catch(() => ({ available: false, row: null })),
    ]);

    const rulesData = rulesDoc.row?.data;
    const due = [
      ...dueBills(finance?.monthlyExpenses ?? [], finance?.transactions ?? [], date),
      ...dueReminders(prefs?.reminders ?? [], date),
      ...flexNudges(
        (rulesData?.rules ?? []) as Rule[],
        (rulesData?.entries ?? []) as RuleEntry[],
        finance?.flexDeposits ?? [],
        finance?.incomeEntries ?? [],
        iso,
        new Date()
      ),
    ];
    if (due.length === 0 || subscriptions.length === 0) {
      return NextResponse.json({ ok: true, date: iso, due: due.length, sent: 0 });
    }

    let sent = 0;
    let pruned = 0;
    for (const sub of subscriptions) {
      // A device registered to one person hears about their bills, plus
      // anything not assigned to either.
      const mine = due.filter((item) => !sub.person || !item.person || item.person === sub.person);
      if (mine.length === 0) continue;
      const lines = mine.slice(0, 3).map((item) => item.text);
      if (mine.length > 3) lines.push(`and ${mine.length - 3} more`);
      // A push that is only about Flex opens the Flex page.
      const allFlex = mine.every((item) => /flex/i.test(item.text));
      const payload = JSON.stringify({
        title: mine.length === 1 ? (allFlex ? "Amazon Flex" : "Due soon") : `${mine.length} things to look at`,
        body: lines.join("\n"),
        url: allFlex ? "/flex" : "/memory",
        tag: `kg-due-${iso}`,
      });
      try {
        await webpush.sendNotification(sub.subscription as unknown as webpush.PushSubscription, payload, {
          TTL: 12 * 3600,
        });
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // Gone for good: the browser dropped the subscription. Forget it.
        if (status === 404 || status === 410) {
          await deletePushSubscription(sub.endpoint);
          pruned += 1;
        }
      }
    }

    return NextResponse.json({ ok: true, date: iso, due: due.length, sent, pruned });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push run failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
