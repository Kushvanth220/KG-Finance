"use client";

import { format } from "date-fns";
import { getAccountsForPerson } from "@/lib/accounts";
import { roundMoney, splitMoney } from "@/lib/money";
import {
  describeSchedule,
  dueLabel,
  daysUntilDue,
  formatReminderAmount,
  isDueSoon,
  parseRepeat,
  reminderDraftFromArgs,
  renderReminderLine,
  toIsoDate,
} from "@/lib/ai/reminders";
import { parseAiUserId } from "@/lib/ai/person";
import {
  buildConfirmationToolResult,
  isToolConfirmed,
  isWriteTool,
  stripConfirmationArg,
} from "@/lib/ai/assistant-confirmation";
import type { AssistantToolCall, AssistantToolResult } from "@/lib/ai/tools";
import { useRulesStore } from "@/store/rules-store";
import { zonedToday } from "@/lib/zoned-date";
import { getDueDateForExpense, getMonthlyExpensePaid } from "@/lib/monthly-expense-tracker";
import {
  buildRuleTable,
  describeRule,
  renderTableMarkdown,
  resolveEntry,
  summariseTable,
} from "@/lib/rules/engine";
import {
  ruleDraftFromArgs,
  ruleUpdatesFromArgs,
  describeRuleValues,
  normalizeRuleValues,
} from "@/lib/rules/from-assistant";
import {
  matchSpendCategoryFromNote,
  resolveSpendCategoryLabel,
} from "@/lib/spend-categories";
import {
  getMonthlyIncome,
  getMonthlySpendTotal,
  getNetWorth,
  groupExpensesByCategory,
  parseMonthKey,
} from "@/lib/calculations";
import { getSettlementSummary } from "@/lib/settlement";
import { PERSON_LABELS, type Account, Debt, Person } from "@/types";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { useFinanceStore } from "@/store/finance-store";

function resolveMonthDate(monthArg: unknown): Date {
  if (typeof monthArg === "string" && /^\d{4}-\d{2}$/.test(monthArg.trim())) {
    return parseMonthKey(monthArg.trim());
  }
  return new Date();
}

function resolveToolPerson(fallback: Person, value: unknown): Person | null {
  return parseAiUserId(value) ?? fallback;
}

type ExpenseFor = Person | "both";
type PaidByMode = Person | "split";

function normalizeAccountKey(value: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^green(dog|dote|dhot|dott)$/.test(key)) return "greendot";
  return key;
}

function findAccountForPerson(person: Person, nameOrId?: string): Account | undefined {
  if (!nameOrId) return undefined;
  const all = useFinanceStore.getState().accounts;
  const scoped = getAccountsForPerson(all, person);
  const byId = scoped.find((account) => account.id === nameOrId) ?? all.find((account) => account.id === nameOrId);
  if (byId) return byId;
  const needle = normalizeAccountKey(nameOrId);
  if (!needle) return undefined;
  const match = (account: Account) => {
    const name = normalizeAccountKey(account.name);
    return name.includes(needle) || needle.includes(name);
  };
  return scoped.find(match) ?? all.find(match);
}

function findDebt(person: Person, debtId?: string, debtName?: string): Debt | undefined {
  const debts = useFinanceStore.getState().debts.filter((debt) => debt.person === person);
  if (debtId) {
    const byId = debts.find((debt) => debt.id === debtId);
    if (byId) return byId;
  }
  if (!debtName) return undefined;
  const normalized = debtName.toLowerCase().trim();
  return debts.find(
    (debt) =>
      debt.name.toLowerCase().includes(normalized) ||
      normalized.includes(debt.name.toLowerCase())
  );
}

function ensureIncomeSource(person: Person, sourceName: string) {
  const store = useFinanceStore.getState();
  const existing = store.incomeSources.find(
    (source) =>
      source.person === person && source.name.toLowerCase() === sourceName.toLowerCase()
  );
  if (existing) return existing;
  store.addIncomeSource(person, sourceName.trim());
  return useFinanceStore.getState().incomeSources.find(
    (source) =>
      source.person === person && source.name.toLowerCase() === sourceName.toLowerCase()
  )!;
}

function todayDate() {
  // The workspace's day, not the browser's. These dates go straight onto money
  // records, so they must follow the same rule as every other date in the app.
  return zonedToday();
}

function parseExpenseFor(value: unknown, fallback: Person): ExpenseFor {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["both", "both of us", "shared", "split", "we", "us"].includes(normalized)) {
    return "both";
  }
  return parseAiUserId(value) ?? fallback;
}

function parsePaidBy(value: unknown, fallback: Person): PaidByMode {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["split", "both paid", "both", "both of us"].includes(normalized)) {
    return "split";
  }
  return parseAiUserId(value) ?? fallback;
}

function amountsMatchTotal(a: number, b: number, total: number) {
  return Math.abs(a + b - total) < 0.01;
}

function resolveCategoryLabel(
  categoryArg: unknown,
  notesArg: unknown,
  categoryId?: string | null
) {
  const store = useFinanceStore.getState();
  const notes = notesArg ? String(notesArg) : "";
  const category = categoryArg ? String(categoryArg) : "";
  const matched = category
    ? store.spendCategories.find((item) =>
        item.name.toLowerCase().includes(category.toLowerCase())
      )
    : matchSpendCategoryFromNote(notes, store.spendCategories);

  return resolveSpendCategoryLabel(store.spendCategories, matched?.id ?? categoryId ?? null, notes || category);
}

function listAccountsForPerson(person: Person) {
  return getAccountsForPerson(useFinanceStore.getState().accounts, person).map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance,
    shared: account.shared ?? false,
    person: account.person,
  }));
}

function recordExpenseTool(person: Person, call: AssistantToolCall): AssistantToolResult {
  const amount = Number(call.args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
  }

  const expenseFor = parseExpenseFor(call.args.expense_for, person);
  const paidBySpecified =
    call.args.paid_by != null && String(call.args.paid_by).trim() !== "";
  const sharedExpense = expenseFor === "both";
  if (sharedExpense && !paidBySpecified) {
    return {
      id: call.id,
      name: call.name,
      result: {
        ok: false,
        needs_payer: true,
        error: `Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both of you?`,
      },
    };
  }
  const paidBy = parsePaidBy(call.args.paid_by, person);
  const category = resolveCategoryLabel(call.args.category, call.args.notes);
  const notes = call.args.notes ? String(call.args.notes) : undefined;

  let expenseShares: Partial<Record<Person, number>> | undefined;
  if (sharedExpense) {
    const kShare = Number(call.args.kushvanth_expense_share);
    const gShare = Number(call.args.g_expense_share);
    const splitEvenly = call.args.split_expense_evenly !== false;

    if (Number.isFinite(kShare) && Number.isFinite(gShare) && kShare + gShare > 0) {
      if (!amountsMatchTotal(kShare, gShare, amount)) {
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: false,
            needs_expense_split: true,
            error: `Expense shares must add to $${amount.toFixed(2)}.`,
          },
        };
      }
      expenseShares = { kushvanth: kShare, g: gShare };
    } else if (splitEvenly) {
      // Cent-exact so the two shares add back to the bill exactly.
      const [kushvanth, g] = splitMoney(amount, 2);
      expenseShares = { kushvanth, g };
    } else {
      return {
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          needs_expense_split: true,
          error: `How should the expense be split between ${PERSON_LABELS.kushvanth} and ${PERSON_LABELS.g}?`,
        },
      };
    }
  }

  const expenseOwner = sharedExpense ? undefined : (expenseFor as Person);

  if (paidBy === "split") {
    let kPaid = Number(call.args.kushvanth_paid_amount);
    let gPaid = Number(call.args.g_paid_amount);

    if (!Number.isFinite(kPaid) || !Number.isFinite(gPaid) || kPaid + gPaid <= 0) {
      const [halfK] = splitMoney(amount, 2);
      kPaid = Number.isFinite(kPaid) && kPaid > 0 ? kPaid : halfK;
      gPaid = Number.isFinite(gPaid) && gPaid > 0 ? gPaid : roundMoney(amount - kPaid);
    }

    if (!amountsMatchTotal(kPaid, gPaid, amount)) {
      return {
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          needs_payment_split: true,
          error: `Payment amounts must add to $${amount.toFixed(2)}.`,
        },
      };
    }

    const payments: Array<{
      person: Person;
      amount: number;
      accountId: string;
      cashSourceAccountId?: string;
    }> = [];

    const payers: Array<{ person: Person; paid: number; accountIdKey: string; accountNameKey: string; cashKey: string }> = [
      {
        person: "kushvanth",
        paid: kPaid,
        accountIdKey: "kushvanth_account_id",
        accountNameKey: "kushvanth_account_name",
        cashKey: "kushvanth_cash_source_account_id",
      },
      {
        person: "g",
        paid: gPaid,
        accountIdKey: "g_account_id",
        accountNameKey: "g_account_name",
        cashKey: "g_cash_source_account_id",
      },
    ];

    for (const entry of payers) {
      if (entry.paid <= 0) continue;

      const account =
        findAccountForPerson(
          entry.person,
          call.args[entry.accountIdKey]
            ? String(call.args[entry.accountIdKey])
            : call.args[entry.accountNameKey]
              ? String(call.args[entry.accountNameKey])
              : undefined
        ) ?? undefined;

      if (!account) {
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: false,
            needs_account: true,
            for_person: entry.person,
            error: `Which account did ${entry.person === "kushvanth" ? PERSON_LABELS.kushvanth : PERSON_LABELS.g} pay $${entry.paid.toFixed(2)} from?`,
            accounts: listAccountsForPerson(entry.person),
          },
        };
      }

      const cashSourceId = call.args[entry.cashKey]
        ? String(call.args[entry.cashKey])
        : undefined;

      if (account.type === "cash" && account.balance < entry.paid && !cashSourceId) {
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: false,
            needs_cash_source: true,
            for_person: entry.person,
            error: `Cash wallet has $${account.balance.toFixed(2)}. Which debit account did the cash come from?`,
            accounts: listAccountsForPerson(entry.person).filter((item) => item.type === "debit"),
          },
        };
      }

      payments.push({
        person: entry.person,
        amount: entry.paid,
        accountId: account.id,
        cashSourceAccountId: cashSourceId,
      });
    }

    if (payments.length === 0) {
      return {
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          needs_payment_split: true,
          error: `Who paid how much — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`,
        },
      };
    }

    useFinanceStore.getState().spendSplit({
      category,
      expenseOwner,
      expenseShares,
      notes,
      payments,
    });

    return {
      id: call.id,
      name: call.name,
      result: {
        ok: true,
        saved: true,
        message: `Recorded $${amount.toFixed(2)} split payment${sharedExpense ? " shared between you both" : ""}.`,
        category,
        expense_for: expenseFor,
        paid_by: "split",
      },
    };
  }

  const payer = paidBy as Person;
  const account =
    findAccountForPerson(
      payer,
      call.args.account_id
        ? String(call.args.account_id)
        : call.args.account_name
          ? String(call.args.account_name)
          : undefined
    ) ?? undefined;

  if (!account) {
    return {
      id: call.id,
      name: call.name,
      result: {
        ok: false,
        needs_account: true,
        for_person: payer,
        error: `Which account did ${payer === "kushvanth" ? PERSON_LABELS.kushvanth : PERSON_LABELS.g} pay from?`,
        accounts: listAccountsForPerson(payer),
      },
    };
  }

  if (
    account.type === "cash" &&
    account.balance < amount &&
    !call.args.cash_source_account_id &&
    !call.args.cash_source_account_name
  ) {
    return {
      id: call.id,
      name: call.name,
      result: {
        ok: false,
        needs_cash_source: true,
        for_person: payer,
        error: `Cash wallet has $${account.balance.toFixed(2)}. Which debit account did the cash come from?`,
        accounts: listAccountsForPerson(payer).filter((item) => item.type === "debit"),
      },
    };
  }

  const cashSourceAccount =
    findAccountForPerson(
      payer,
      call.args.cash_source_account_id
        ? String(call.args.cash_source_account_id)
        : call.args.cash_source_account_name
          ? String(call.args.cash_source_account_name)
          : undefined
    ) ?? undefined;

  const beneficiaryPerson =
    !sharedExpense && expenseOwner && expenseOwner !== payer ? expenseOwner : undefined;

  useFinanceStore.getState().spend({
    person: payer,
    amount,
    accountId: account.id,
    cashSourceAccountId: cashSourceAccount?.id,
    category,
    notes,
    beneficiaryPerson,
    expenseOwner,
    expenseShares,
  });

  const updated = useFinanceStore.getState().accounts.find((item) => item.id === account.id);

  let message = `Recorded $${amount.toFixed(2)}`;
  if (category) message += ` for ${category}`;
  message += ` paid by ${payer === "kushvanth" ? PERSON_LABELS.kushvanth : PERSON_LABELS.g} from ${account.name}.`;
  if (sharedExpense) message += " Split between both of you.";
  else if (beneficiaryPerson) {
    message += ` Expense for ${beneficiaryPerson === "kushvanth" ? PERSON_LABELS.kushvanth : PERSON_LABELS.g}.`;
  }

  return {
    id: call.id,
    name: call.name,
    result: {
      ok: true,
      saved: true,
      message,
      new_balance: updated?.balance,
      account_name: account.name,
    },
  };
}

export function executeAssistantTool(
  person: Person,
  call: AssistantToolCall
): AssistantToolResult {
  if (isWriteTool(call.name) && !isToolConfirmed(call.args)) {
    return {
      id: call.id,
      name: call.name,
      result: buildConfirmationToolResult(call),
    };
  }

  const args = isWriteTool(call.name) ? stripConfirmationArg(call.args) : call.args;
  const effectiveCall = { ...call, args };

  const store = useFinanceStore.getState();

  try {
    switch (effectiveCall.name) {
      case "list_accounts": {
        const forPerson = parseAiUserId(call.args.for_person) ?? person;
        return {
          id: call.id,
          name: call.name,
          result: { ok: true, for_person: forPerson, accounts: listAccountsForPerson(forPerson) },
        };
      }

      case "list_spend_categories": {
        const categories = store.spendCategories.map((category) => ({
          id: category.id,
          name: category.name,
          keywords: category.keywords ?? [],
        }));
        return { id: call.id, name: call.name, result: { ok: true, categories } };
      }

      case "list_income_sources": {
        const sources = store.incomeSources.map((source) => ({
          id: source.id,
          name: source.name,
          person: source.person,
        }));
        return { id: call.id, name: call.name, result: { ok: true, sources } };
      }

      case "record_income": {
        const amount = Number(call.args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
        }

        const sourceName = String(call.args.source_name ?? "Income");
        const forPerson = parseAiUserId(args.for_person) ?? person;
        const depositAccount =
          findAccountForPerson(
            forPerson,
            args.deposit_account_id
              ? String(args.deposit_account_id)
              : args.deposit_account_name
                ? String(args.deposit_account_name)
                : undefined
          ) ?? undefined;

        if (!depositAccount) {
          return {
            id: effectiveCall.id,
            name: effectiveCall.name,
            result: {
              ok: false,
              needs_account: true,
              error: "Which account was the money deposited into?",
              accounts: listAccountsForPerson(forPerson),
            },
          };
        }

        const source = ensureIncomeSource(forPerson, sourceName);
        store.addIncome({
          person: forPerson,
          sourceId: source.id,
          amount,
          date: call.args.date ? String(call.args.date) : todayDate(),
          notes: call.args.notes ? String(call.args.notes) : undefined,
          depositType: depositAccount.type === "cash" ? "cash" : "debit",
          depositAccountId: depositAccount.id,
        });

        const updated = useFinanceStore.getState().accounts.find(
          (account) => account.id === depositAccount.id
        );

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Recorded $${amount.toFixed(2)} from ${sourceName} into ${depositAccount.name}.`,
            new_balance: updated?.balance,
            account_name: depositAccount.name,
          },
        };
      }

      case "record_expense":
        return recordExpenseTool(person, effectiveCall);

      case "add_debt": {
        const name = String(call.args.name ?? "").trim();
        const amount = Number(call.args.amount);
        if (!name) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Debt name required" } };
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
        }

        store.addDebt({
          person,
          name,
          amount,
          notes: call.args.notes ? String(call.args.notes) : undefined,
        });

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Added debt "${name}" for $${amount.toFixed(2)}.`,
          },
        };
      }

      case "add_account": {
        const name = String(call.args.name ?? "").trim();
        const rawType = String(call.args.account_type ?? "").toLowerCase().trim();
        const accountType =
          rawType === "credit" || rawType === "debit" || rawType === "cash" ? rawType : null;

        if (!name) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Account name required" } };
        }
        if (!accountType) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "Is it a debit account, a credit card, or cash?" },
          };
        }

        // Creating a second "GreenDot" would silently split their history, so
        // match on name the same way the rest of the app resolves accounts.
        const existing = store.accounts.find(
          (account) => account.name.toLowerCase().trim() === name.toLowerCase()
        );
        if (existing) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              already_exists: true,
              error: `"${existing.name}" already exists.`,
            },
          };
        }

        const owner = parseAiUserId(call.args.for_person) ?? person;
        const startingBalance = Number(call.args.starting_balance);
        const creditLimit = Number(call.args.credit_limit);

        store.addAccount({
          person: owner,
          name,
          type: accountType,
          balance: Number.isFinite(startingBalance) ? roundMoney(startingBalance) : 0,
          ...(accountType === "credit" && Number.isFinite(creditLimit)
            ? { creditLimit: roundMoney(creditLimit) }
            : {}),
          ...(call.args.shared === true ? { shared: true } : {}),
        });

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Added ${accountType} account "${name}".`,
          },
        };
      }

      case "record_debt_payment": {
        const amount = Number(call.args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
        }

        const debt = findDebt(
          person,
          call.args.debt_id ? String(call.args.debt_id) : undefined,
          call.args.debt_name ? String(call.args.debt_name) : undefined
        );

        if (!debt) {
          const debts = store.debts
            .filter((item) => item.person === person)
            .map((item) => ({ id: item.id, name: item.name, amount: item.amount }));
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              needs_debt: true,
              error: "Which debt is this payment for?",
              debts,
            },
          };
        }

        store.recordDebtPayment(
          debt.id,
          amount,
          call.args.notes ? String(call.args.notes) : undefined
        );

        const updated = useFinanceStore.getState().debts.find((item) => item.id === debt.id);

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Recorded $${amount.toFixed(2)} payment toward ${debt.name}.`,
            remaining: updated?.amount ?? 0,
          },
        };
      }

      case "pay_debt_from_account": {
        const amount = Number(call.args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
        }

        const debt = findDebt(
          person,
          call.args.debt_id ? String(call.args.debt_id) : undefined,
          call.args.debt_name ? String(call.args.debt_name) : undefined
        );
        const account = findAccountForPerson(
          person,
          call.args.from_account_id
            ? String(call.args.from_account_id)
            : call.args.from_account_name
              ? String(call.args.from_account_name)
              : undefined
        );

        if (!debt) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Debt not found" } };
        }
        if (!account) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Account not found" } };
        }

        store.payDebt(
          debt.id,
          amount,
          account.id,
          call.args.notes ? String(call.args.notes) : undefined
        );

        const updatedDebt = useFinanceStore.getState().debts.find((item) => item.id === debt.id);

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Paid $${amount.toFixed(2)} toward ${debt.name} from ${account.name}.`,
            remaining: updatedDebt?.amount ?? 0,
          },
        };
      }

      case "adjust_account_balance": {
        const newBalance = Number(args.new_balance);
        if (!Number.isFinite(newBalance)) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "What should the new balance be?" },
          };
        }

        const accountNameOrId = args.account_id
          ? String(args.account_id)
          : args.account_name
            ? String(args.account_name)
            : undefined;

        if (!accountNameOrId) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              needs_account: true,
              error: "Which account should I update — Green Dot, Chime, or another?",
              accounts: listAccountsForPerson(person),
            },
          };
        }

        const account = findAccountForPerson(person, accountNameOrId);

        if (!account) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              needs_account: true,
              error: "Which account should I update?",
              accounts: listAccountsForPerson(person),
            },
          };
        }

        const previous = account.balance;
        store.adjustAccountBalance(
          account.id,
          newBalance,
          args.notes ? String(args.notes) : "Updated from AI"
        );
        const updated = useFinanceStore.getState().accounts.find((item) => item.id === account.id);

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            account_name: account.name,
            previous_balance: previous,
            new_balance: updated?.balance ?? newBalance,
            message: `Saved. ${account.name} is now $${(updated?.balance ?? newBalance).toFixed(2)}. Check Accounts and History.`,
          },
        };
      }

      case "calculate_monthly_summary": {
        const forPerson = resolveToolPerson(person, args.for_person);
        if (!forPerson) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "for_person must be kushvanth or g" },
          };
        }
        const monthDate = resolveMonthDate(args.month);
        const income = getMonthlyIncome(store.incomeEntries, forPerson, monthDate);
        const spend = getMonthlySpendTotal(
          store.transactions,
          forPerson,
          monthDate,
          store.settlementHistory
        );
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            person: forPerson,
            month: format(monthDate, "yyyy-MM"),
            income_usd: income,
            spend_usd: spend,
            net_usd: income - spend,
            summary: `${PERSON_LABELS[forPerson]}: income $${income.toFixed(2)}, spend $${spend.toFixed(2)}, net $${(income - spend).toFixed(2)} for ${format(monthDate, "MMMM yyyy")}.`,
          },
        };
      }

      case "calculate_net_worth": {
        const forPerson = args.for_person ? parseAiUserId(args.for_person) : null;
        const netWorth = getNetWorth(store.accounts, store.debts, forPerson);
        const assets = store.accounts
          .filter((a) => !forPerson || a.shared || a.person === forPerson)
          .filter((a) => a.type !== "credit")
          .reduce((sum, a) => sum + a.balance, 0);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            for_person: forPerson ?? "both",
            net_worth_usd: netWorth,
            liquid_assets_usd: assets,
            summary: `Net worth${forPerson ? ` for ${PERSON_LABELS[forPerson]}` : " (combined)"}: $${netWorth.toFixed(2)}.`,
          },
        };
      }

      case "calculate_category_breakdown": {
        const forPerson = resolveToolPerson(person, args.for_person);
        if (!forPerson) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "for_person must be kushvanth or g" },
          };
        }
        const monthDate = resolveMonthDate(args.month);
        const monthTx = store.transactions.filter((tx) => {
          if (tx.type !== "expense") return false;
          return tx.date.startsWith(format(monthDate, "yyyy-MM"));
        });
        const breakdown = groupExpensesByCategory(monthTx, forPerson);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            person: forPerson,
            month: format(monthDate, "yyyy-MM"),
            categories: breakdown,
          },
        };
      }

      case "calculate_between_us_balance": {
        const summary = getSettlementSummary(store.settlementBalance);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            balance_usd: store.settlementBalance,
            amount_owed: summary.amount,
            label: summary.label,
            summary: summary.label,
          },
        };
      }

      case "preview_expense_split": {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
        }
        const splitEvenly = args.split_evenly !== false;
        let kShare = Number(args.kushvanth_share);
        let gShare = Number(args.g_share);
        if (splitEvenly || !Number.isFinite(kShare) || !Number.isFinite(gShare)) {
          [kShare, gShare] = splitMoney(amount, 2);
        }
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            total_usd: amount,
            kushvanth_share: kShare,
            g_share: gShare,
            summary: `Split $${amount.toFixed(2)}: ${PERSON_LABELS.kushvanth} $${kShare.toFixed(2)}, ${PERSON_LABELS.g} $${gShare.toFixed(2)}.`,
          },
        };
      }

      case "save_behavior_preference": {
        const instruction = String(args.instruction ?? "").trim();
        if (!instruction) {
          return { id: call.id, name: call.name, result: { ok: false, error: "instruction required" } };
        }
        useAssistantPreferencesStore.getState().addBehaviorInstruction(instruction);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Got it — I'll remember: "${instruction.slice(0, 120)}"`,
          },
        };
      }

      case "save_reminder": {
        const reminder = String(args.reminder ?? "").trim();
        if (!reminder) {
          return { id: call.id, name: call.name, result: { ok: false, error: "reminder required" } };
        }
        const when = args.when ? String(args.when).trim() : "";
        const timezone = args.timezone ? String(args.timezone).trim() : "";
        // Keep only what does not fit a real field, so the text stays the
        // user's words and the schedule lives as data.
        const extras = [when, timezone ? `tz:${timezone}` : ""].filter(Boolean).join(" · ");
        const text = extras ? `${reminder} (${extras})` : reminder;

        const reminderPerson = parseAiUserId(args.person) ?? undefined;
        const draft = {
          ...reminderDraftFromArgs(args, text),
          ...(reminderPerson ? { person: reminderPerson } : {}),
        };
        useAssistantPreferencesStore.getState().addStructuredReminder(draft);
        const amount = draft.amount != null ? ` (${formatReminderAmount(draft.amount)})` : "";
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            // Read back the schedule too, so a mis-heard cycle is caught now
            // rather than the day a bill is missed.
            message: `Saved. I'll remember: "${text.slice(0, 140)}"${amount} — ${describeSchedule({
              id: "new",
              ...draft,
            })}`,
          },
        };
      }

      case "update_reminder": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useAssistantPreferencesStore.getState();
        // Match every candidate, not the first. Changing the wrong reminder
        // because two share a word is silent damage the user would not see.
        const hits = match
          ? store.structuredReminders.filter((item) => item.text.toLowerCase().includes(match))
          : [];
        if (hits.length > 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `"${args.match ?? ""}" matches ${hits.length} reminders: ${hits
                .map((item) => `"${item.text}"`)
                .join(", ")}. Ask which one they mean.`,
            },
          };
        }
        const target = hits[0];
        if (!match || !target) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `No reminder matched "${args.match ?? ""}". Call list_reminders and use the exact wording.`,
            },
          };
        }

        const asNumber = (value: unknown, min: number, max: number) => {
          const n = Number(value);
          return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
        };
        const repeat = parseRepeat(args.repeat);
        const amount = args.amount != null ? Number(args.amount) : undefined;
        const until = String(args.until ?? "").trim();

        const updates: Partial<typeof target> = {
          ...(args.new_text ? { text: String(args.new_text).trim() } : {}),
          ...(repeat ? { repeat } : {}),
          ...(args.day_of_month != null ? { dayOfMonth: asNumber(args.day_of_month, 1, 31) } : {}),
          ...(args.weekday != null ? { weekday: asNumber(args.weekday, 0, 6) } : {}),
          ...(args.month != null ? { month: asNumber(args.month, 1, 12) } : {}),
          ...(/^\d{4}-\d{2}-\d{2}$/.test(String(args.date ?? "")) ? { date: String(args.date) } : {}),
          ...(/^\d{1,2}:\d{2}$/.test(String(args.time ?? "")) ? { time: String(args.time) } : {}),
          ...(args.lead_days != null ? { leadDays: asNumber(args.lead_days, 0, 60) ?? target.leadDays } : {}),
          ...(amount != null && Number.isFinite(amount)
            ? { amount: amount > 0 ? Math.round(amount * 100) / 100 : undefined }
            : {}),
          ...(/^\d{4}-\d{2}-\d{2}$/.test(until) ? { until } : /^none$/i.test(until) ? { until: undefined } : {}),
          ...(typeof args.alarm === "boolean" ? { alarm: args.alarm || undefined } : {}),
          ...(Array.isArray(args.times)
            ? (() => {
                const list = [...new Set((args.times as unknown[]).map(String).filter((t) => /^\d{1,2}:\d{2}$/.test(t)))].sort();
                return { time: list[0], times: list.length > 1 ? list : undefined };
              })()
            : {}),
          ...(Array.isArray(args.weekdays)
            ? { weekdays: [...new Set((args.weekdays as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] }
            : {}),
          ...(args.nth != null ? { nth: asNumber(args.nth, -1, 4) || undefined } : {}),
          ...(args.every != null ? { every: asNumber(args.every, 1, 365) } : {}),
          ...(["day", "week", "month", "year"].includes(String(args.unit)) ? { unit: String(args.unit) as "day" | "week" | "month" | "year" } : {}),
          ...(args.count != null ? { count: asNumber(args.count, 1, 999) } : {}),
          ...(args.lead_minutes != null ? { leadMinutes: asNumber(args.lead_minutes, 1, 1440) } : {}),
          ...(args.snooze_minutes != null ? { snoozeMinutes: asNumber(args.snooze_minutes, 1, 120) } : {}),
          ...(typeof args.paused === "boolean" ? { paused: args.paused || undefined } : {}),
          ...(typeof args.note === "string" ? { note: args.note.trim().slice(0, 300) || undefined } : {}),
          // A different cycle makes the old "done through" meaningless.
          ...(repeat && repeat !== target.repeat ? { doneThrough: undefined } : {}),
        };
        // An alarm rings at a time; one switched on without any rings at nine.
        if (updates.alarm && !updates.time && !target.time) updates.time = "09:00";
        // Counting "10 times" needs a first day to count from.
        if (updates.count && !updates.date && !target.date) updates.date = toIsoDate(new Date());
        // Every other week counts from a first day; moving onto it without
        // one would leave it never due, so start from today.
        if (repeat === "biweekly" && !updates.date && !target.date) updates.date = toIsoDate(new Date());

        store.updateStructuredReminder(target.id, updates);
        const after = { ...target, ...updates };
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Updated: "${after.text}" — ${describeSchedule(after)}.`,
          },
        };
      }

      case "delete_reminder": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useAssistantPreferencesStore.getState();
        const hits = match
          ? store.structuredReminders.filter((item) => item.text.toLowerCase().includes(match))
          : [];
        if (hits.length > 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `"${args.match ?? ""}" matches ${hits.length} reminders: ${hits
                .map((item) => `"${item.text}"`)
                .join(", ")}. Ask which one to remove.`,
            },
          };
        }
        const target = hits[0];
        if (!match || !target) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No reminder matched "${args.match ?? ""}".` },
          };
        }
        store.deleteStructuredReminder(target.id);
        return {
          id: call.id,
          name: call.name,
          result: { ok: true, saved: true, message: `Removed: "${target.text}".` },
        };
      }

      case "list_behavior_preferences": {
        const rules = useAssistantPreferencesStore.getState().behaviorInstructions;
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            count: rules.length,
            rules,
            summary: rules.length === 0 ? "No saved rules." : rules.join("; "),
          },
        };
      }

      case "delete_behavior_preference": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useAssistantPreferencesStore.getState();
        const rules = store.behaviorInstructions;
        const target = rules.find((line) => line.toLowerCase().includes(match));
        if (!match || !target) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No rule matched "${args.match ?? ""}".` },
          };
        }
        store.setBehaviorInstructions(rules.filter((line) => line !== target));
        void store.syncToServer();
        return {
          id: call.id,
          name: call.name,
          result: { ok: true, saved: true, message: `Stopped following: "${target}".` },
        };
      }

      case "list_reminders": {
        const reminders = useAssistantPreferencesStore.getState().reminders;
        const pending = reminders.filter((line) => !line.toUpperCase().startsWith("[DONE]"));
        const done = reminders.filter((line) => line.toUpperCase().startsWith("[DONE]"));
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            count: reminders.length,
            pending,
            done,
            reminders,
            summary:
              reminders.length === 0
                ? "No saved reminders yet."
                : `${pending.length} pending, ${done.length} done. Pending: ${pending.join("; ") || "none"}`,
          },
        };
      }

      case "mark_reminder_done": {
        const match = String(args.reminder ?? "").trim();
        const marked = useAssistantPreferencesStore.getState().markReminderDone(match);
        if (!marked) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No pending reminder matched "${match}".` },
          };
        }
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Marked done: ${marked.replace(/^\[DONE\]\s*/i, "")}`,
          },
        };
      }

      case "list_rules": {
        const scope = String(args.for_person ?? "").trim().toLowerCase();
        const store = useRulesStore.getState();
        const rules =
          scope === "kushvanth" || scope === "g" || scope === "shared"
            ? store.rulesFor(scope as "kushvanth" | "g" | "shared")
            : store.rules;
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            count: rules.length,
            rules: rules.map((rule) => ({
              name: rule.name,
              scope: rule.scope,
              enabled: rule.enabled,
              description: rule.description,
              how_it_works: describeRule(rule),
              records: rule.fields.map((field) => field.key),
              works_out: rule.calculations.map((calc) => `${calc.key} = ${calc.expression}`),
              entries: store.entriesFor(rule.id).length,
            })),
            summary:
              rules.length === 0
                ? "No rules yet. Offer to write one down when they describe how something works."
                : rules.map((rule) => `${rule.name}: ${describeRule(rule)}`).join(" "),
          },
        };
      }

      case "read_rule_table": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useRulesStore.getState();
        const hits = store.findRule(match);
        if (hits.length === 0) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No rule matched "${args.match ?? ""}".` },
          };
        }
        if (hits.length > 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `"${args.match ?? ""}" matches ${hits.map((r) => `"${r.name}"`).join(", ")}. Ask which one.`,
            },
          };
        }
        const rule = hits[0]!;
        const table = buildRuleTable(rule, store.entriesFor(rule.id));
        const limit = Number(args.limit);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            rule: rule.name,
            row_count: table.rows.length,
            table_markdown: renderTableMarkdown(table, Number.isFinite(limit) ? limit : 20),
            totals: summariseTable(table, rule),
            // Ids so a wrong row can actually be corrected afterwards.
            entries: table.rows
              .slice(0, Number.isFinite(limit) ? limit : 20)
              .map((row) => ({
                entry_id: row.__entryId,
                date: row.date,
                values: Object.fromEntries(
                  Object.entries(row).filter(([key]) => key !== "__entryId")
                ),
              })),
          },
        };
      }

      case "list_due_followups": {
        const store = useRulesStore.getState();
        const due = store.dueNow();
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            count: due.length,
            due: due.map((item) => ({
              entry_id: item.entry.id,
              follow_up_id: item.followUp.id,
              rule: item.rule.name,
              question: item.followUp.question,
              asks_for: item.followUp.fields,
              logged_on: item.entry.date,
              overdue_hours: item.overdueHours,
              already_recorded: resolveEntry(item.rule, item.entry),
            })),
            summary:
              due.length === 0
                ? "Nothing a rule is waiting on."
                : due
                    .map((item) => `${item.rule.name} (${item.entry.date}): ${item.followUp.question}`)
                    .join(" "),
          },
        };
      }

      case "create_rule": {
        const built = ruleDraftFromArgs(args);
        if (!built.ok) {
          return { id: call.id, name: call.name, result: { ok: false, error: built.error } };
        }
        const store = useRulesStore.getState();
        const clash = store.rules.find(
          (rule) => rule.name.toLowerCase() === built.draft.name.toLowerCase()
        );
        if (clash) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `A rule called "${clash.name}" already exists. Use update_rule instead.`,
            },
          };
        }
        const rule = store.addRule(built.draft);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            rule: rule.name,
            how_it_works: describeRule(rule),
            message: `Rule saved: ${rule.name}.`,
          },
        };
      }

      case "update_rule": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useRulesStore.getState();
        const hits = store.findRule(match);
        if (hits.length === 0) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No rule matched "${args.match ?? ""}".` },
          };
        }
        if (hits.length > 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `"${args.match ?? ""}" matches ${hits.map((r) => `"${r.name}"`).join(", ")}. Ask which one.`,
            },
          };
        }
        const target = hits[0]!;
        const built = ruleUpdatesFromArgs(args, target);
        if (!built.ok) {
          return { id: call.id, name: call.name, result: { ok: false, error: built.error } };
        }
        store.updateRule(target.id, built.updates);
        const updated = useRulesStore.getState().getRule(target.id)!;
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            rule: updated.name,
            how_it_works: describeRule(updated),
            message: `Updated: ${updated.name}.`,
          },
        };
      }

      case "delete_rule": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useRulesStore.getState();
        const hits = store.findRule(match);
        if (hits.length === 0) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: `No rule matched "${args.match ?? ""}".` },
          };
        }
        if (hits.length > 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error: `"${args.match ?? ""}" matches ${hits.map((r) => `"${r.name}"`).join(", ")}. Ask which one.`,
            },
          };
        }
        const target = hits[0]!;
        const lost = store.entriesFor(target.id).length;
        store.deleteRule(target.id);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Deleted "${target.name}" and ${lost} recorded ${lost === 1 ? "entry" : "entries"}.`,
          },
        };
      }

      case "log_rule_entry": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const store = useRulesStore.getState();
        const hits = store.findRule(match);
        if (hits.length !== 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error:
                hits.length === 0
                  ? `No rule matched "${args.match ?? ""}".`
                  : `"${args.match ?? ""}" matches ${hits.map((r) => `"${r.name}"`).join(", ")}. Ask which one.`,
            },
          };
        }
        const rule = hits[0]!;
        const normalized = normalizeRuleValues(rule.fields, args.values ?? {});
        if (!normalized.ok) {
          return { id: call.id, name: call.name, result: { ok: false, error: normalized.error } };
        }
        const values = normalized.values;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date ?? ""))
          ? String(args.date)
          : undefined;
        const entry = store.openEntry(rule.id, values, date);
        if (!entry) {
          return { id: call.id, name: call.name, result: { ok: false, error: "Could not record that." } };
        }
        const resolved = resolveEntry(rule, entry);
        const waiting = rule.followUps
          .filter((followUp) => !entry.answered.includes(followUp.id))
          .map((followUp) => `${followUp.question} in ${followUp.afterHours}h`);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            entry_id: entry.id,
            rule: rule.name,
            recorded: resolved,
            waiting_on: waiting,
            // Say this plainly. A rule with an income payout made the model
            // ask "which account?" over and over, because it assumed logging
            // moved money. It does not: the entry is a record, and posting it
            // is a separate, explicit step.
            no_account_needed: true,
            note: "This is recorded under the rule only. No account changed, so do not ask which account to use.",
            message: `Logged under ${rule.name}: ${describeRuleValues(rule, resolved)}.`,
          },
        };
      }

      case "answer_rule_followup": {
        const entryId = String(args.entry_id ?? "").trim();
        const store = useRulesStore.getState();
        const entry = store.entries.find((item) => item.id === entryId);
        if (!entry) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "That entry is gone. Call list_due_followups again." },
          };
        }
        const rule = store.getRule(entry.ruleId);
        if (!rule) {
          return { id: call.id, name: call.name, result: { ok: false, error: "That rule is gone." } };
        }
        const answered = normalizeRuleValues(rule.fields, args.values ?? {});
        if (!answered.ok) {
          return { id: call.id, name: call.name, result: { ok: false, error: answered.error } };
        }
        const followUpId = String(args.follow_up_id ?? "").trim() || undefined;
        store.answerEntry(entryId, answered.values, followUpId);
        const updated = useRulesStore.getState().entries.find((item) => item.id === entryId)!;
        const resolved = resolveEntry(rule, updated);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            rule: rule.name,
            complete: updated.complete,
            recorded: resolved,
            message: `${rule.name} for ${updated.date}: ${describeRuleValues(rule, resolved)}.`,
          },
        };
      }

      case "update_rule_entry": {
        const entryId = String(args.entry_id ?? "").trim();
        const store = useRulesStore.getState();
        const entry = store.entries.find((item) => item.id === entryId);
        if (!entry) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "No entry with that id. Call read_rule_table for the ids." },
          };
        }
        const rule = store.getRule(entry.ruleId);
        if (!rule) {
          return { id: call.id, name: call.name, result: { ok: false, error: "That rule is gone." } };
        }

        const updates: Partial<typeof entry> = {};
        if (args.values && Object.keys(args.values as object).length > 0) {
          const normalized = normalizeRuleValues(rule.fields, args.values);
          if (!normalized.ok) {
            return { id: call.id, name: call.name, result: { ok: false, error: normalized.error } };
          }
          // Merge: only the fields named are changed.
          updates.values = { ...entry.values, ...normalized.values };
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(args.date ?? ""))) {
          updates.date = String(args.date);
        }
        if (Object.keys(updates).length === 0) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "Nothing in that changes the entry." },
          };
        }

        const before = { date: entry.date, ...resolveEntry(rule, entry) };
        store.updateEntry(entryId, updates);
        const after = useRulesStore.getState().entries.find((item) => item.id === entryId)!;
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            rule: rule.name,
            was: before,
            now: { date: after.date, ...resolveEntry(rule, after) },
            message: `Updated that ${rule.name} entry.`,
          },
        };
      }

      case "delete_rule_entry": {
        const entryId = String(args.entry_id ?? "").trim();
        const store = useRulesStore.getState();
        const entry = store.entries.find((item) => item.id === entryId);
        if (!entry) {
          return {
            id: call.id,
            name: call.name,
            result: { ok: false, error: "No entry with that id. Call read_rule_table for the ids." },
          };
        }
        const rule = store.getRule(entry.ruleId);
        const summary = rule ? describeRuleValues(rule, resolveEntry(rule, entry)) : entry.date;
        store.deleteEntry(entryId);
        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            saved: true,
            message: `Removed the ${entry.date} entry (${summary}).`,
          },
        };
      }

      case "get_daily_briefing": {
        const now = new Date();
        // The day number has to be the workspace's, not the server's — a UTC
        // getDate() is already tomorrow through the whole Central evening.
        const day = Number(zonedToday(now).slice(8, 10));
        const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
        const dateLabel = now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "America/Chicago",
        });
        // Reminders carry real schedules now, so what is due is CALCULATED.
        // This used to substring-match the day number against the sentence,
        // which fired on any reminder that merely contained those digits.
        const structured = useAssistantPreferencesStore.getState().structuredReminders;
        const openItems = structured.filter((item) => !item.done);
        const dueNow = openItems
          .filter((item) => isDueSoon(item, now))
          .map((item) => ({
            reminder: item.text,
            due: dueLabel(item, now),
            days_away: daysUntilDue(item, now),
          }))
          .sort((a, b) => (a.days_away ?? 99) - (b.days_away ?? 99));
        const pending = openItems.map(renderReminderLine);
        const undated = openItems.filter((item) => daysUntilDue(item, now) == null).length;

        // The brief is more than reminders: what is in the bank, what bills are
        // about to land, and whether Flex still owes an answer about tips.
        const finance = useFinanceStore.getState();
        const available = finance.accounts
          .filter((a) => a.person === person && a.type !== "credit")
          .reduce((sum, a) => sum + a.balance, 0);
        const owedOnCards = finance.accounts
          .filter((a) => a.person === person && a.type === "credit")
          .reduce((sum, a) => sum + a.balance, 0);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const billsSoon = finance.monthlyExpenses
          .filter((bill) => bill.person === person && bill.isRecurring && (bill.amount ?? 0) > 0)
          .map((bill) => {
            const due = getDueDateForExpense(bill, now);
            if (!due) return null;
            const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - todayStart) / 86400000);
            if (days < -31 || days > 7) return null;
            if (getMonthlyExpensePaid(finance.transactions, bill, now) >= (bill.amount ?? 0)) return null;
            return { bill: bill.name, amount: bill.amount, days_away: days, status: days < 0 ? "overdue" : days === 0 ? "due today" : `due in ${days} days` };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => a.days_away - b.days_away);
        const flexTipsPending = useRulesStore
          .getState()
          .dueNow(now)
          .filter((item) => /flex/i.test(item.rule.name)).length;

        return {
          id: call.id,
          name: call.name,
          result: {
            ok: true,
            today: dateLabel,
            day_of_month: day,
            weekday,
            timezone: "America/Chicago (US Central)",
            pending_reminders: pending,
            due_now: dueNow,
            undated_count: undated,
            available_balance: Math.round(available * 100) / 100,
            owed_on_cards: Math.round(owedOnCards * 100) / 100,
            bills_soon: billsSoon,
            flex_tips_pending: flexTipsPending,
            summary: [
              `Today is ${dateLabel}.`,
              `$${available.toFixed(2)} available` + (owedOnCards > 0 ? `, $${owedOnCards.toFixed(2)} on cards.` : "."),
              billsSoon.length > 0
                ? `Bills: ${billsSoon.map((b) => `${b.bill} $${(b.amount ?? 0).toFixed(0)} ${b.status}`).join("; ")}.`
                : "No bills due this week.",
              flexTipsPending > 0 ? `${flexTipsPending} Flex ${flexTipsPending === 1 ? "block is" : "blocks are"} waiting on tips.` : "",
              dueNow.length > 0
                ? `Reminders due: ${dueNow.map((item) => `${item.reminder} (${item.due})`).join("; ")}.`
                : pending.length === 0
                  ? "No pending reminders."
                  : `${pending.length} reminders pending, none due yet.`,
            ]
              .filter(Boolean)
              .join(" "),
          },
        };
      }

      case "update_income_source":
      case "delete_income_source": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const hits = store.incomeSources.filter((s) => s.name.toLowerCase().includes(match));
        if (!match || hits.length !== 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error:
                hits.length > 1
                  ? `"${args.match}" matches ${hits.length} sources: ${hits.map((s) => `"${s.name}"`).join(", ")}. Ask which.`
                  : `No income source matched "${args.match ?? ""}". Call list_income_sources for the exact names.`,
            },
          };
        }
        const source = hits[0]!;
        if (effectiveCall.name === "delete_income_source") {
          store.deleteIncomeSource(source.id);
          return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Deleted income source "${source.name}".` } };
        }
        const newName = String(args.new_name ?? "").trim();
        if (!newName) return { id: call.id, name: call.name, result: { ok: false, error: "New name required." } };
        store.updateIncomeSource(source.id, newName);
        return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Renamed "${source.name}" to "${newName}".` } };
      }

      case "update_spend_category":
      case "delete_spend_category": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const hits = store.spendCategories.filter((c) => c.name.toLowerCase().includes(match));
        if (!match || hits.length !== 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error:
                hits.length > 1
                  ? `"${args.match}" matches ${hits.length} categories: ${hits.map((c) => `"${c.name}"`).join(", ")}. Ask which.`
                  : `No category matched "${args.match ?? ""}". Call list_spend_categories for the exact names.`,
            },
          };
        }
        const category = hits[0]!;
        if (effectiveCall.name === "delete_spend_category") {
          store.deleteSpendCategory(category.id);
          return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Deleted category "${category.name}".` } };
        }
        const updates: { name?: string; keywords?: string[]; budget?: number } = {};
        if (args.new_name) updates.name = String(args.new_name).trim();
        if (Array.isArray(args.keywords)) updates.keywords = (args.keywords as unknown[]).map(String).filter(Boolean);
        if (args.budget !== undefined) {
          const budget = Number(args.budget);
          updates.budget = Number.isFinite(budget) && budget > 0 ? budget : undefined;
        }
        store.updateSpendCategory(category.id, updates);
        return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Updated category "${category.name}".` } };
      }

      case "update_debt":
      case "delete_debt": {
        const match = String(args.match ?? "").trim().toLowerCase();
        const hits = store.debts.filter((d) => d.name.toLowerCase().includes(match));
        if (!match || hits.length !== 1) {
          return {
            id: call.id,
            name: call.name,
            result: {
              ok: false,
              error:
                hits.length > 1
                  ? `"${args.match}" matches ${hits.length} debts: ${hits.map((d) => `"${d.name}"`).join(", ")}. Ask which.`
                  : `No debt matched "${args.match ?? ""}".`,
            },
          };
        }
        const debt = hits[0]!;
        if (effectiveCall.name === "delete_debt") {
          store.deleteDebt(debt.id);
          return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Removed the debt "${debt.name}".` } };
        }
        const updates: { name?: string; amount?: number; notes?: string } = {};
        if (args.name) updates.name = String(args.name).trim();
        if (args.amount !== undefined) {
          const amount = Number(args.amount);
          if (!Number.isFinite(amount) || amount < 0) return { id: call.id, name: call.name, result: { ok: false, error: "Invalid amount" } };
          updates.amount = amount;
        }
        if (args.notes !== undefined) updates.notes = String(args.notes);
        store.updateDebt(debt.id, updates);
        return { id: call.id, name: call.name, result: { ok: true, saved: true, message: `Updated the debt "${debt.name}".` } };
      }

      default:
        return {
          id: call.id,
          name: call.name,
          result: { ok: false, error: `Unknown tool: ${call.name}` },
        };
    }
  } catch (error) {
    return {
      id: call.id,
      name: call.name,
      result: {
        ok: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
    };
  }
}

export function executeAssistantTools(
  person: Person,
  calls: AssistantToolCall[]
): AssistantToolResult[] {
  return calls.map((call) => executeAssistantTool(person, call));
}
