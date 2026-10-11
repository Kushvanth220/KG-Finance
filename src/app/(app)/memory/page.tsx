"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CreditCard,
  Landmark,
  Sparkles,
  Tags,
  TrendingUp,
} from "lucide-react";
import {
  EditableRow,
  MemoryEmpty,
  MemorySection,
  NewEntryRow,
} from "@/components/memory/memory-section";
import { ReminderEditor } from "@/components/memory/reminder-editor";
import { useAssistantName, useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import {
  describeSchedule,
  doneForThisCycle,
  dueLabel,
  isDueSoon,
  nextDueDate,
  ringLabel,
  toIsoDate,
  type Reminder,
} from "@/lib/ai/reminders";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceStore } from "@/store/finance-store";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { MemoryPulse } from "@/components/art/page-art";
import { ReminderCalendar } from "@/components/memory/reminder-calendar";
import { NotificationCard } from "@/components/memory/notification-card";
import { AlarmClock, CalendarDays, List } from "lucide-react";
import { PERSON_LABELS } from "@/types";

/**
 * The app's memory: everything the assistant knows, by category, all editable here.
 *
 * Two different stores feed this page. Reminders and behaviour rules live with
 * the assistant (Supabase, via /api/ai/preferences); sources, categories and
 * debts live in the finance store on the device. The page hides that seam —
 * from the user's side it is one mind — but saves have to route to the right
 * place, which is why the assistant sections carry their own saving state.
 *
 * There is no Bills section: anything due — rent, a card payment, a transfer —
 * is a reminder.
 */

const SNOOZES = [
  { days: 1, label: "1d", name: "for a day" },
  { days: 3, label: "3d", name: "for 3 days" },
  { days: 7, label: "1w", name: "for a week" },
];

export default function MemoryPage() {
  const assistantName = useAssistantName();
  const {
    incomeSources,
    addIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    spendCategories,
    addSpendCategory,
    updateSpendCategory,
    deleteSpendCategory,
    debts,
    accounts,
  } = useFinanceStore();

  // Reminders and behaviour rules come from the SAME store the assistant reads,
  // not a private fetch — otherwise this page and the assistant drift apart. The store
  // pushes every change to Supabase itself.
  const {
    structuredReminders,
    behaviorInstructions,
    addStructuredReminder,
    updateStructuredReminder,
    deleteStructuredReminder,
    toggleReminderDone,
    addBehaviorInstruction,
    setBehaviorInstructions,
    syncToServer,
    hydrateFromServer,
  } = useAssistantPreferencesStore();

  useEffect(() => {
    // Pull anything saved from the other phone before showing the page.
    void hydrateFromServer();
  }, [hydrateFromServer]);

  const saveBehaviors = (next: string[]) => {
    setBehaviorInstructions(next);
    void syncToServer();
  };

  // ---- which "add" row is open ----
  const [adding, setAdding] = useState<null | "behavior" | "source" | "category">(null);
  const [layout, setLayout] = useState<"list" | "calendar">("list");
  // Whose reminders to show; "both" is everything, since a shared reminder
  // belongs to whoever is looking.
  const [who, setWho] = useState<"both" | "kushvanth" | "g">("both");

  // "Not now": the reminder keeps its date; nothing raises it until then.
  const snooze = (id: string, days: number) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const iso = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}`;
    updateStructuredReminder(id, { snoozedUntil: iso });
  };
  const [reminderEditor, setReminderEditor] = useState<null | { reminder?: Reminder; alarm?: boolean }>(null);
  const [pendingDelete, setPendingDelete] = useState<null | {
    label: string;
    detail: string;
    run: () => void;
  }>(null);

  const openDebts = debts.filter((debt) => debt.amount > 0);

  // Open first, then soonest-due, so the top of the list is what needs doing.
  const orderedReminders = useMemo(
    () =>
      [...structuredReminders]
        .filter((item) => who === "both" || !item.person || item.person === who)
        .sort((a, b) => {
          if (a.done !== b.done) return Number(a.done) - Number(b.done);
          return Number(isDueSoon(b)) - Number(isDueSoon(a));
        }),
    [structuredReminders, who]
  );
  const pendingCount = structuredReminders.filter((item) => !item.done).length;
  const dueSoonCount = structuredReminders.filter((item) => isDueSoon(item)).length;

  return (
    <div className="space-y-3 pb-4 max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2.5 text-lg font-bold leading-tight">
            <MemoryPulse count={pendingCount} />
            Memory
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Everything {assistantName} remembers about your finances. Edit anything here.
          </p>
        </div>
        <div className="glass flex shrink-0 gap-0.5 rounded-lg p-0.5">
          {(
            [
              { id: "list", icon: List, label: "List" },
              { id: "calendar", icon: CalendarDays, label: "Calendar" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setLayout(option.id)}
              aria-label={option.label}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                layout === option.id ? "bg-feature text-white" : "text-muted"
              )}
            >
              <option.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {layout === "calendar" ? (
        <ReminderCalendar reminders={structuredReminders} />
      ) : null}

      <NotificationCard />

      <div className="glass flex gap-0.5 rounded-xl p-0.5">
        {(
          [
            { id: "both", label: "Both" },
            { id: "kushvanth", label: PERSON_LABELS.kushvanth },
            { id: "g", label: PERSON_LABELS.g },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setWho(option.id)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
              who === option.id ? "bg-feature text-white" : "text-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* ---- reminders ---- */}
      <MemorySection
        title="Reminders"
        hint={
          structuredReminders.length === 0
            ? `What ${assistantName} brings up when you check in`
            : `${pendingCount} open · ${dueSoonCount} due now`
        }
        count={pendingCount}
        tint="var(--warning)"
        icon={<Bell className="w-3.5 h-3.5" />}
        addLabel="Add"
        onAdd={() => setReminderEditor({})}
        extraAction={
          <button
            type="button"
            onClick={() => setReminderEditor({ alarm: true })}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white"
          >
            <AlarmClock className="h-3 w-3" />
            Alarm
          </button>
        }
      >
        {orderedReminders.length === 0 ? (
          <MemoryEmpty>
            Nothing yet. Say &ldquo;remind me…&rdquo; to {assistantName}, or add one here.
          </MemoryEmpty>
        ) : (
          orderedReminders.map((reminder) => {
            const soon = isDueSoon(reminder);
            const cycleDone = doneForThisCycle(reminder);
            return (
              <div key={reminder.id} className="flex items-start gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[13px] leading-snug",
                      reminder.done && "text-muted line-through decoration-1"
                    )}
                  >
                    {reminder.alarm ? (
                      <AlarmClock className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-accent" aria-label="Alarm" />
                    ) : null}
                    {reminder.text}
                    {reminder.amount ? (
                      <span className="ml-1.5 font-semibold tabular-nums">{formatCurrency(reminder.amount)}</span>
                    ) : null}
                  </p>
                  {!reminder.done && (ringLabel(reminder) || reminder.paused) ? (
                    <p className={cn("mt-0.5 text-[10.5px] font-medium", reminder.paused ? "text-muted" : "text-accent")}>
                      {reminder.paused ? "Paused" : ringLabel(reminder)}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleReminderDone(reminder.id)}
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold",
                        reminder.done || cycleDone
                          ? "bg-positive/15 text-positive"
                          : "bg-caution/15 text-caution"
                      )}
                    >
                      {reminder.done
                        ? "Done · reopen"
                        : cycleDone
                          ? `Done this time · ${dueLabel(reminder).replace(/^Due/, "next")}`
                          : "Open · mark done"}
                    </button>
                    {!reminder.done && soon ? (
                      <span className="rounded-full bg-negative/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-negative">
                        {dueLabel(reminder)}
                      </span>
                    ) : null}
                    {!reminder.done && reminder.snoozedUntil && !soon ? (
                      <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9.5px] font-semibold text-muted dark:bg-white/10">
                        {dueLabel(reminder)}
                      </span>
                    ) : null}
                    {!reminder.done && reminder.repeat !== "once" ? (
                      <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted">
                        <button
                          type="button"
                          onClick={() => {
                            const next = nextDueDate(reminder);
                            updateStructuredReminder(reminder.id, {
                              skip: reminder.skip ? undefined : next ? toIsoDate(next) : undefined,
                            });
                          }}
                          className="hit rounded px-1 font-semibold text-accent hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {reminder.skip ? `Unskip ${reminder.skip.slice(5).replace("-", "/")}` : "Skip next"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStructuredReminder(reminder.id, { paused: reminder.paused ? undefined : true })}
                          className="hit rounded px-1 font-semibold text-accent hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {reminder.paused ? "Resume" : "Pause"}
                        </button>
                      </span>
                    ) : null}
                    {!reminder.done && !cycleDone && !reminder.alarm ? (
                      <span className="inline-flex items-center gap-0.5 text-[9.5px] text-muted">
                        snooze
                        {SNOOZES.map((option) => (
                          <button
                            key={option.days}
                            type="button"
                            onClick={() => snooze(reminder.id, option.days)}
                            aria-label={`Snooze ${option.name}`}
                            className="hit rounded px-1 font-semibold text-accent hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {option.label}
                          </button>
                        ))}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-muted">
                      {describeSchedule(reminder)}
                      {reminder.leadDays > 0 ? ` · ${reminder.leadDays}d early` : ""}
                      {reminder.person ? ` · ${PERSON_LABELS[reminder.person]}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setReminderEditor({ reminder })}
                    className="rounded-md p-1.5 text-[11px] text-accent hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDelete({
                        label: "Delete this reminder?",
                        detail: reminder.text,
                        run: () => deleteStructuredReminder(reminder.id),
                      })
                    }
                    className="rounded-md p-1.5 text-[11px] text-negative hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </MemorySection>

      {/* ---- behaviour ---- */}
      <MemorySection
        title={`How ${assistantName} behaves`}
        hint="Rules it follows in every conversation"
        count={behaviorInstructions.length}
        tint="var(--feature)"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        addLabel="Add"
        onAdd={() => setAdding("behavior")}
      >
        {adding === "behavior" ? (
          <NewEntryRow
            placeholder="Ask one question at a time"
            onCommit={(value) => {
              addBehaviorInstruction(value);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        ) : null}
        {behaviorInstructions.length === 0 && adding !== "behavior" ? (
          <MemoryEmpty>No rules saved yet.</MemoryEmpty>
        ) : (
          behaviorInstructions.map((item, index) => (
            <EditableRow
              key={`${item}-${index}`}
              value={item}
              placeholder="Rule"
              onSave={(next) => {
                const rules = [...behaviorInstructions];
                rules[index] = next;
                saveBehaviors(rules);
              }}
              onDelete={() =>
                setPendingDelete({
                  label: "Delete this rule?",
                  detail: item,
                  run: () => saveBehaviors(behaviorInstructions.filter((_, i) => i !== index)),
                })
              }
            />
          ))
        )}
      </MemorySection>

      {/* ---- income sources ---- */}
      <MemorySection
        title="Income sources"
        hint="Where money comes from"
        count={incomeSources.length}
        tint="var(--success)"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        addLabel="Add"
        onAdd={() => setAdding("source")}
      >
        {adding === "source" ? (
          <NewEntryRow
            placeholder="Amazon Flex"
            onCommit={(value) => {
              addIncomeSource("kushvanth", value);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        ) : null}
        {incomeSources.length === 0 && adding !== "source" ? (
          <MemoryEmpty>No income sources yet.</MemoryEmpty>
        ) : (
          incomeSources.map((source) => (
            <EditableRow
              key={source.id}
              value={source.name}
              placeholder="Source name"
              meta={PERSON_LABELS[source.person]}
              onSave={(next) => updateIncomeSource(source.id, next)}
              onDelete={() =>
                setPendingDelete({
                  label: "Delete this income source?",
                  detail: `${source.name} — past income keeps its name in History.`,
                  run: () => deleteIncomeSource(source.id),
                })
              }
            />
          ))
        )}
      </MemorySection>

      {/* ---- spend categories ---- */}
      <MemorySection
        title="Spending categories"
        hint="How spending gets sorted, and the words that match each one"
        count={spendCategories.length}
        tint="var(--accent)"
        icon={<Tags className="w-3.5 h-3.5" />}
        addLabel="Add"
        onAdd={() => setAdding("category")}
      >
        {adding === "category" ? (
          <NewEntryRow
            placeholder="Groceries"
            onCommit={(value) => {
              addSpendCategory(value);
              setAdding(null);
            }}
            onCancel={() => setAdding(null)}
          />
        ) : null}
        {spendCategories.length === 0 && adding !== "category" ? (
          <MemoryEmpty>No categories yet.</MemoryEmpty>
        ) : (
          spendCategories.map((category) => (
            <EditableRow
              key={category.id}
              value={category.name}
              placeholder="Category name"
              meta={
                category.keywords?.length
                  ? `Matches: ${category.keywords.join(", ")}`
                  : "No keywords"
              }
              onSave={(next) => updateSpendCategory(category.id, { name: next })}
              onDelete={() =>
                setPendingDelete({
                  label: "Delete this category?",
                  detail: `${category.name} — past spending keeps its category in History.`,
                  run: () => deleteSpendCategory(category.id),
                })
              }
            />
          ))
        )}
      </MemorySection>

      {/* ---- debts + accounts: shown here, edited where they live ---- */}
      <MemorySection
        title="Debts"
        hint="What is still owed"
        count={openDebts.length}
        tint="var(--pink)"
        icon={<Landmark className="w-3.5 h-3.5" />}
      >
        {openDebts.length === 0 ? (
          <MemoryEmpty>Nothing outstanding.</MemoryEmpty>
        ) : (
          openDebts.map((debt) => (
            <div key={debt.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{debt.name}</p>
                <p className="text-[10px] text-muted">{PERSON_LABELS[debt.person]}</p>
              </div>
              <p className="shrink-0 text-[13px] font-semibold text-negative tabular-nums">
                {formatCurrency(debt.amount)}
              </p>
            </div>
          ))
        )}
        <Link
          href="/debts"
          className="block px-4 py-2.5 text-[11px] font-semibold text-accent"
        >
          Record payments on the Debts page →
        </Link>
      </MemorySection>

      <MemorySection
        title="Accounts"
        hint="Cards, banks, and cash"
        count={accounts.length}
        tint="var(--accent-secondary)"
        icon={<CreditCard className="w-3.5 h-3.5" />}
      >
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate">{account.name}</p>
              <p className="text-[10px] text-muted capitalize">
                {account.type}
                {account.shared ? " · shared" : ` · ${PERSON_LABELS[account.person]}`}
              </p>
            </div>
            <p className="shrink-0 text-[13px] font-semibold tabular-nums">
              {formatCurrency(account.balance)}
            </p>
          </div>
        ))}
        <Link
          href="/accounts"
          className="block px-4 py-2.5 text-[11px] font-semibold text-accent"
        >
          Change balances on the Accounts page →
        </Link>
      </MemorySection>

      {reminderEditor ? (
        <ReminderEditor
          open
          initial={reminderEditor.reminder}
          startAsAlarm={reminderEditor.alarm}
          onClose={() => setReminderEditor(null)}
          onSave={(draft) => {
            if (reminderEditor.reminder) {
              updateStructuredReminder(reminderEditor.reminder.id, draft);
            } else {
              addStructuredReminder(draft);
            }
            setReminderEditor(null);
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={pendingDelete.label}
          message={pendingDelete.detail}
          confirmLabel="Delete"
          onConfirm={() => {
            pendingDelete.run();
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
