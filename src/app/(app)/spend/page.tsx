"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  RotateCcw,
  Undo2,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SpendCategoryManager } from "@/components/spend/spend-category-manager";
import { AmountCalculator } from "@/components/spend/amount-calculator";
import { SpendDial } from "@/components/spend/spend-dial";
import { GlassModal } from "@/components/ui/glass-modal";
import { SelfTransferSheet } from "@/components/accounts/self-transfer-sheet";
import { useFinanceStore } from "@/store/finance-store";
import { getAccountsForPerson, isSharedAccount } from "@/lib/accounts";
import { formatAmount, formatCurrency, parseAppDateTime } from "@/lib/formatters";
import { CategoryTypoHint } from "@/components/spend/category-typo-hint";
import { useQuickAction } from "@/lib/quick-actions";
import { RollingMoney } from "@/components/spend/rolling-money";
import {
  matchSpendCategoryFromNote,
  resolveSpendCategoryLabel,
} from "@/lib/spend-categories";
import { getSettlementUpdatesFromShares } from "@/lib/transaction-reversal";
import { describeSettlementFromSpend, getSettlementSummary } from "@/lib/settlement";
import { PERSON_LABELS, type Account, type Person, type SpendCategory, type Transaction } from "@/types";
import { splitMoney } from "@/lib/money";
import { evaluateAmount, hasOperator } from "@/lib/amount-expression";
import { categoryLook } from "@/lib/category-look";
import { haptic } from "@/lib/haptics";
import { findRecentDuplicate, noteSuggestions, recentCategoryNames } from "@/lib/spend-assist";
import { cn } from "@/lib/utils";
import { SpendDoneArt } from "@/components/art/page-art";
import { BudgetBar, categorySpentThisMonth } from "@/components/spend/budget-bar";
import { DueBills } from "@/components/spend/due-bills";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type Step = "details" | "payment" | "cash-source" | "done";
type PaidByMode = "kushvanth" | "g" | "split";

type CategorySelection = {
  type: "category";
  categoryId: string;
  name: string;
  owner: Person | "both";
};

type ExpenseOwner = Person | "both";

interface PaymentSelection {
  person: Person;
  amount: number;
  accountId: string;
  cashSourceAccountId?: string;
}

/** What the done screen shows and what Undo takes back. */
interface SavedSpend {
  ids: string[];
  accountIds: string[];
  amount: number;
  category: string;
  refund: boolean;
  /** Each account's balance just before, so the done screen can roll it down to the new one. */
  before: Record<string, number>;
}

/** Every account's balance right now, by id. */
const balancesNow = (): Record<string, number> =>
  Object.fromEntries(useFinanceStore.getState().accounts.map((account) => [account.id, account.balance]));

const UNDO_SECONDS = 8;

function isSharedExpense(owner: ExpenseOwner): boolean {
  return owner === "both";
}

function keywordsSubLine(category: SpendCategory): string | null {
  const keywords = category.keywords?.filter(Boolean) ?? [];
  if (keywords.length === 0) return null;
  if (keywords.length <= 2) return keywords.join(", ");
  return `${keywords.slice(0, 2).join(", ")} +${keywords.length - 2}`;
}

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function SpendPage() {
  const still = useReducedMotion();
  const {
    accounts,
    spendCategories,
    spend,
    spendSplit,
    deleteTransaction,
    transactions,
    settlementBalance,
  } = useFinanceStore();

  const [step, setStep] = useState<Step>("details");
  // The amount box holds text, not a number: "12.5+3.2" is a valid thing to type.
  const [amount, setAmount] = useState("");
  const [selection, setSelection] = useState<CategorySelection | null>(null);
  const [expenseOwner, setExpenseOwner] = useState<ExpenseOwner>("kushvanth");
  const [manualCategoryPick, setManualCategoryPick] = useState(false);
  const [paidByMode, setPaidByMode] = useState<PaidByMode>("kushvanth");
  const [kushShare, setKushShare] = useState("");
  const [gShare, setGShare] = useState("");
  const [expenseShareKush, setExpenseShareKush] = useState("");
  const [expenseShareG, setExpenseShareG] = useState("");
  const [notes, setNotes] = useState("");
  const [notesFocused, setNotesFocused] = useState(false);
  const [spendDate, setSpendDate] = useState(todayIso);
  const [refund, setRefund] = useState(false);

  const [pendingCashFor, setPendingCashFor] = useState<Person | null>(null);
  const [splitPayments, setSplitPayments] = useState<Partial<Record<Person, PaymentSelection>>>({});

  const [manageOpen, setManageOpen] = useState(false);
  // The amount text the calculator opened on; null while it is closed.
  const [calculatorFrom, setCalculatorFrom] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Every category, from the dial's "More" place.
  const [categorySheet, setCategorySheet] = useState(false);
  const [saved, setSaved] = useState<SavedSpend | null>(null);
  const [undoLeft, setUndoLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ prior: Transaction; ago: string; run: () => void } | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Ticks the Undo countdown down while the done screen is up.
  useEffect(() => {
    if (step !== "done") return;
    const id = setInterval(() => setUndoLeft((left) => (left > 0 ? left - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const parsedAmount = evaluateAmount(amount) ?? 0;
  const sharedExpense = isSharedExpense(expenseOwner);

  const selectedCategory = useMemo(
    () => spendCategories.find((c) => c.id === selection?.categoryId) ?? null,
    [spendCategories, selection?.categoryId]
  );

  const categoryLabel = useMemo(
    () => resolveSpendCategoryLabel(spendCategories, selection?.categoryId ?? null, notes),
    [spendCategories, selection?.categoryId, notes]
  );

  // The three categories in use this week lead the grid; the rest keep their order.
  const orderedCategories = useMemo(() => {
    const recent = recentCategoryNames(transactions, 7, 3).map((name) => name.toLowerCase());
    const lead: SpendCategory[] = [];
    for (const name of recent) {
      const found = spendCategories.find((c) => c.name.trim().toLowerCase() === name);
      if (found) lead.push(found);
    }
    const rest = spendCategories.filter((c) => !lead.includes(c));
    return { lead, all: [...lead, ...rest] };
  }, [spendCategories, transactions]);

  const suggestions = useMemo(
    () => (notesFocused ? noteSuggestions(transactions, notes, 4) : []),
    [transactions, notes, notesFocused]
  );

  const reset = () => {
    setStep("details");
    setAmount("");
    setSelection(null);
    setExpenseOwner("kushvanth");
    setManualCategoryPick(false);
    setPaidByMode("kushvanth");
    setKushShare("");
    setGShare("");
    setExpenseShareKush("");
    setExpenseShareG("");
    setNotes("");
    setNotesFocused(false);
    setSpendDate(todayIso());
    setRefund(false);
    setPendingCashFor(null);
    setSplitPayments({});
    setManageOpen(false);
    setCategorySheet(false);
    setSaved(null);
    setUndoLeft(0);
    setNotice(null);
    setDuplicate(null);
  };

  const applySplitAmounts = (total: number, mode: PaidByMode, resetSplit = false) => {
    if (mode === "kushvanth") {
      setKushShare(String(total));
      setGShare("0");
    } else if (mode === "g") {
      setKushShare("0");
      setGShare(String(total));
    } else if (resetSplit || (kushShare === "" && gShare === "")) {
      // Cent-exact: an odd total gives the extra cent to one side so the two
      // halves add back to the bill instead of both rounding up in the display.
      const [kush, g] = splitMoney(total, 2);
      setKushShare(String(kush));
      setGShare(String(g));
    }
  };

  const applyEvenExpenseSplit = (total: number) => {
    const [kush, g] = splitMoney(total, 2);
    setExpenseShareKush(String(kush));
    setExpenseShareG(String(g));
  };

  /** Re-derive the shares from a new total, keeping whatever mode is on. */
  const recomputeShares = (total: number) => {
    if (sharedExpense) {
      applyEvenExpenseSplit(total);
    } else if (paidByMode !== "split") {
      applySplitAmounts(total, paidByMode);
    } else {
      applySplitAmounts(total, "split", kushShare === "" && gShare === "");
    }
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    setNotice(null);
    recomputeShares(evaluateAmount(val) ?? 0);
  };

  /** "12.5+3.2" becomes "15.7" once the field is left, so the sum is what gets saved. */
  const settleExpression = () => {
    if (!hasOperator(amount)) return;
    const value = evaluateAmount(amount);
    if (value !== null) setAmount(String(value));
  };

  const appendPlus = () => {
    setAmount((current) => `${current.replace(/[+\-*/x×÷]\s*$/, "")}+`);
    amountRef.current?.focus();
  };

  const openCalculator = () => {
    // Taken before the field lets go of focus, which would settle "12+3" into "15".
    setCalculatorFrom(amount);
    // And the phone's keyboard goes down, so the keypad isn't hidden under it.
    amountRef.current?.blur();
  };
  // Press and hold Spend in the tab bar → Calculator.
  useQuickAction("calculator", openCalculator);

  const handleNotesChange = (val: string) => {
    setNotes(val);
    setNotice(null);
    if (manualCategoryPick) return;

    const matched = matchSpendCategoryFromNote(val, spendCategories);
    if (matched) {
      setSelection({
        type: "category",
        categoryId: matched.id,
        name: matched.name,
        owner: expenseOwner,
      });
    }
  };

  const selectCategory = (category: SpendCategory) => {
    setManualCategoryPick(true);
    setSelection({
      type: "category",
      categoryId: category.id,
      name: category.name,
      owner: expenseOwner,
    });
  };

  const pickSuggestion = (note: string, categoryName?: string) => {
    setNotes(note);
    const category = categoryName
      ? spendCategories.find((c) => c.name.trim().toLowerCase() === categoryName.trim().toLowerCase())
      : undefined;
    if (category) selectCategory(category);
    else handleNotesChange(note);
  };

  const handleOwnerChange = (owner: ExpenseOwner) => {
    setExpenseOwner(owner);
    if (selection) {
      setSelection({ ...selection, owner });
    }

    if (owner === "both" && parsedAmount > 0) {
      applyEvenExpenseSplit(parsedAmount);
    } else if (owner !== "both") {
      setExpenseShareKush("");
      setExpenseShareG("");
    }
  };

  const handlePaidByChange = (mode: PaidByMode) => {
    setPaidByMode(mode);
    setSplitPayments({});
    if (parsedAmount <= 0) return;
    if (mode === "split") {
      applySplitAmounts(parsedAmount, "split", true);
    } else if (!sharedExpense) {
      applySplitAmounts(parsedAmount, mode);
    }
  };

  // A refund goes back to one account; "both paid" has no meaning for it.
  const handleRefundChange = (on: boolean) => {
    setRefund(on);
    if (on && paidByMode === "split") handlePaidByChange("kushvanth");
  };

  const handleExpenseShareKushChange = (val: string) => {
    setExpenseShareKush(val);
  };

  const handleExpenseShareGChange = (val: string) => {
    setExpenseShareG(val);
  };

  const handleKushShareChange = (val: string) => {
    setKushShare(val);
    setSplitPayments({});
  };

  const handleGShareChange = (val: string) => {
    setGShare(val);
    setSplitPayments({});
  };

  const applyEvenSplit = () => {
    if (parsedAmount <= 0) return;
    applySplitAmounts(parsedAmount, "split", true);
    setSplitPayments({});
  };

  const applyEvenExpenseSplitAction = () => {
    if (parsedAmount <= 0) return;
    applyEvenExpenseSplit(parsedAmount);
  };

  const isCategoryValid = !!selection?.categoryId;

  const kushAmount = parseFloat(kushShare) || 0;
  const gAmount = parseFloat(gShare) || 0;
  const expenseShareKushAmt = parseFloat(expenseShareKush) || 0;
  const expenseShareGAmt = parseFloat(expenseShareG) || 0;

  const paymentSharesValid =
    paidByMode !== "split" ||
    (kushAmount + gAmount > 0 &&
      Math.abs(kushAmount + gAmount - parsedAmount) < 0.01);

  const expenseSharesValid =
    !sharedExpense ||
    (expenseShareKushAmt + expenseShareGAmt > 0 &&
      Math.abs(expenseShareKushAmt + expenseShareGAmt - parsedAmount) < 0.01);

  const sharesValid = paymentSharesValid && expenseSharesValid;
  const detailsReady = isCategoryValid && parsedAmount > 0 && sharesValid;

  const splitRemaining = parsedAmount - kushAmount - gAmount;
  const expenseSplitRemaining = parsedAmount - expenseShareKushAmt - expenseShareGAmt;

  const spendMeta = useMemo(() => {
    if (sharedExpense) {
      return { expenseOwner: undefined as Person | undefined };
    }
    return { expenseOwner: expenseOwner === "both" ? undefined : expenseOwner };
  }, [expenseOwner, sharedExpense]);

  const handleDetailsNext = () => {
    if (!isCategoryValid || parsedAmount <= 0 || !sharesValid) return;
    haptic();
    settleExpression();
    setSplitPayments({});
    setStep("payment");
  };

  const getPersonAccounts = (person: Person) => getAccountsForPerson(accounts, person);
  const getDebitAccounts = (person: Person) => getPersonAccounts(person).filter((a) => a.type === "debit");
  const getCashAccount = (person: Person) => getPersonAccounts(person).find((a) => a.type === "cash");

  const activePayers = useMemo((): Person[] => {
    if (paidByMode === "kushvanth") return ["kushvanth"];
    if (paidByMode === "g") return ["g"];
    const list: Person[] = [];
    if (kushAmount > 0) list.push("kushvanth");
    if (gAmount > 0) list.push("g");
    return list;
  }, [paidByMode, kushAmount, gAmount]);

  const getShareForPerson = (person: Person) =>
    person === "kushvanth" ? kushAmount : gAmount;

  const handleSelectAccount = (account: Account, forPerson: Person) => {
    const share = getShareForPerson(forPerson);

    if (paidByMode === "split") {
      if (account.type === "cash") {
        setPendingCashFor(forPerson);
        setStep("cash-source");
      } else {
        setSplitPayments((prev) => ({
          ...prev,
          [forPerson]: { person: forPerson, amount: share, accountId: account.id },
        }));
      }
    } else {
      // A refund into cash is just cash in hand — no account to draw it from.
      if (account.type === "cash" && !refund) {
        setPendingCashFor(forPerson);
        setStep("cash-source");
      } else {
        confirmTransaction(forPerson, account.id);
      }
    }
  };

  const handleCashSource = (sourceId: string | null) => {
    const forPerson = pendingCashFor!;
    const cashAccount = getCashAccount(forPerson);
    if (!cashAccount) return;

    if (paidByMode === "split") {
      setSplitPayments((prev) => ({
        ...prev,
        [forPerson]: {
          person: forPerson,
          amount: getShareForPerson(forPerson),
          accountId: cashAccount.id,
          cashSourceAccountId: sourceId ?? undefined,
        },
      }));
      setStep("payment");
      setPendingCashFor(null);
    } else {
      confirmTransaction(forPerson, cashAccount.id, sourceId ?? undefined);
    }
  };

  const getExpenseShares = () => {
    if (!sharedExpense) return undefined;
    return {
      kushvanth: expenseShareKushAmt,
      g: expenseShareGAmt,
    };
  };

  const notesToSave = () => notes.trim() || undefined;

  const finish = (ids: string[], accountIds: string[], label: string, before: Record<string, number>) => {
    setSaved({ ids, accountIds, amount: parsedAmount, category: label, refund, before });
    setUndoLeft(UNDO_SECONDS);
    haptic([10, 40, 14]);
    setStep("done");
  };

  /**
   * The same amount and category inside two minutes is almost always a
   * double tap, so the second one has to be asked for.
   */
  const guardDuplicate = (label: string, run: () => void) => {
    const prior = findRecentDuplicate(transactions, parsedAmount, label);
    if (prior) setDuplicate({ prior, ago: describeAgo(prior), run });
    else run();
  };

  const confirmSplit = () => {
    const label = resolveSpendCategoryLabel(
      spendCategories,
      selection?.categoryId ?? null,
      notes
    );
    const payments = (["kushvanth", "g"] as Person[])
      .map((p) => splitPayments[p])
      .filter((p): p is PaymentSelection => !!p && p.amount > 0);

    if (payments.length === 0) return;

    guardDuplicate(label, () => {
      const before = balancesNow();
      const ids = spendSplit({
        category: label,
        expenseOwner: sharedExpense ? undefined : (expenseOwner as Person),
        expenseShares: getExpenseShares(),
        notes: notesToSave(),
        payments,
        date: spendDate,
      });
      // Cash taken out for it comes from the bank, so the bank is what moved.
      const moved = payments.flatMap((p) => (p.cashSourceAccountId ? [p.cashSourceAccountId] : [p.accountId]));
      finish(ids, [...new Set(moved)], label, before);
    });
  };

  // Cheap enough to derive every render; the compiler memoizes it.
  const balancePreview = (() => {
    if (parsedAmount <= 0) return null;

    const describe = (paidBy: Person, benefited: Person, value: number) =>
      refund
        ? `${PERSON_LABELS[benefited]}'s ${formatCurrency(value)} share comes back to ${PERSON_LABELS[paidBy]} — ${PERSON_LABELS[benefited]} owes ${formatCurrency(value)} less`
        : describeSettlementFromSpend(paidBy, benefited, value);

    if (sharedExpense && expenseSharesValid) {
      const shares = {
        kushvanth: expenseShareKushAmt,
        g: expenseShareGAmt,
      };
      if (paidByMode === "split") return null;
      return getSettlementUpdatesFromShares(paidByMode, shares).map(({ benefited, amount: value }) =>
        describe(paidByMode, benefited, value)
      );
    }

    if (
      !sharedExpense &&
      expenseOwner !== "both" &&
      paidByMode !== "split" &&
      paidByMode !== expenseOwner
    ) {
      return [describe(paidByMode, expenseOwner as Person, parsedAmount)];
    }

    return null;
  })();

  const expenseOwnerLabel =
    expenseOwner === "both"
      ? "Both of us"
      : PERSON_LABELS[expenseOwner as Person];

  const confirmTransaction = (
    payer: Person,
    accountId: string,
    cashSourceAccountId?: string
  ) => {
    const label = resolveSpendCategoryLabel(
      spendCategories,
      selection?.categoryId ?? null,
      notes
    );

    guardDuplicate(label, () => {
      const before = balancesNow();
      const id = spend({
        person: payer,
        amount: parsedAmount,
        accountId,
        cashSourceAccountId,
        category: label,
        notes: notesToSave(),
        beneficiaryPerson:
          sharedExpense
            ? undefined
            : payer !== expenseOwner && expenseOwner !== "both"
              ? (expenseOwner as Person)
              : undefined,
        expenseShares: getExpenseShares(),
        expenseOwner: spendMeta.expenseOwner,
        date: spendDate,
        refund,
      });
      // Cash taken out for it comes from the bank, so the bank is what moved.
      const paying = accounts.find((a) => a.id === accountId);
      const moved = paying?.type === "cash" && cashSourceAccountId ? cashSourceAccountId : accountId;
      finish(id ? [id] : [], [moved], label, before);
    });
  };

  const undo = () => {
    if (!saved) return;
    const by: Person = paidByMode === "split" ? "kushvanth" : paidByMode;
    for (const id of saved.ids) deleteTransaction(id, by);
    haptic([8, 30, 8]);
    const what = saved.refund ? "refund" : "spend";
    reset();
    setNotice(`Undone — the ${what} was taken back out. Nothing is recorded.`);
  };

  const splitReady =
    paidByMode === "split" &&
    sharesValid &&
    activePayers.every((p) => {
      const share = getShareForPerson(p);
      return share <= 0 || !!splitPayments[p];
    });

  const singlePayer = paidByMode !== "split" ? paidByMode : null;

  const handleCategoryDeleted = (id: string) => {
    if (selection?.categoryId === id) {
      setSelection(null);
      setManualCategoryPick(false);
    }
  };

  const openDatePicker = () => {
    const el = dateRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  const renderAccountPicker = (person: Person) => {
    const share = getShareForPerson(person);
    const personAccounts = getPersonAccounts(person);
    const done = paidByMode === "split" && !!splitPayments[person];

    return (
      <div key={person} className="space-y-1.5">
        <p className="text-xs font-medium px-1 flex items-center justify-between">
          {PERSON_LABELS[person]} · {formatCurrency(paidByMode === "split" ? share : parsedAmount)}
          {done && <span className="text-positive text-[10px]">✓</span>}
        </p>
        {(!done || paidByMode !== "split") && (
          <>
            {personAccounts.filter((a) => a.type === "credit").map((a) => (
              <GlassCard
                key={a.id}
                onClick={() => handleSelectAccount(a, person)}
                className="flex justify-between py-2 px-3 cursor-pointer"
              >
                <span className="text-sm font-medium">
                  <CreditCard className="w-3.5 h-3.5 inline mr-1.5" />
                  {a.name}
                </span>
                <span className="text-[11px] text-muted">
                  {formatCurrency((a.creditLimit ?? 0) - a.balance)} left
                </span>
              </GlassCard>
            ))}
            {personAccounts.filter((a) => a.type === "debit").map((a) => (
              <GlassCard
                key={a.id}
                onClick={() => handleSelectAccount(a, person)}
                className="flex justify-between py-2 px-3 cursor-pointer"
              >
                <span className="text-sm font-medium">
                  <Wallet className="w-3.5 h-3.5 inline mr-1.5" />
                  {a.name}
                  {isSharedAccount(a) ? (
                    <span className="ml-1 text-[10px] text-feature">· Shared</span>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted">{formatCurrency(a.balance)}</span>
              </GlassCard>
            ))}
            {getCashAccount(person) && (
              <GlassCard
                onClick={() => handleSelectAccount(getCashAccount(person)!, person)}
                className="flex justify-between py-2 px-3 cursor-pointer"
              >
                <span className="text-sm font-medium">
                  <Banknote className="w-3.5 h-3.5 inline mr-1.5" />
                  Cash
                </span>
                <span className="text-[11px] text-muted">
                  {formatCurrency(getCashAccount(person)!.balance)}
                </span>
              </GlassCard>
            )}
          </>
        )}
      </div>
    );
  };

  const stepLabel =
    step === "details" ? "1 · Details" : step === "payment" ? "2 · Pay" : step === "cash-source" ? "2 · Cash" : "Done";
  const currentStep = step === "details" ? 1 : 2;

  const isToday = spendDate === todayIso();
  const dateLabel = isToday ? "Today" : format(parseAppDateTime(spendDate), "MM/dd/yyyy");

  const segment = (active: boolean) =>
    cn(
      "flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all",
      active ? "glass-pill" : "text-muted"
    );

  // What the saved spend did to the account(s) and to Balance.
  const savedAccounts = saved
    ? saved.accountIds
        .map((id) => accounts.find((a) => a.id === id))
        .filter((a): a is Account => !!a)
    : [];
  const betweenNow = getSettlementSummary(settlementBalance);

  return (
    <div className="space-y-3 max-w-lg mx-auto pb-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold leading-tight">{refund && step !== "done" ? "Refund" : "Spend"}</h1>
          <p className="text-[10px] text-muted">{stepLabel}</p>
        </div>
        {step !== "details" && step !== "done" && (
          <button
            type="button"
            onClick={reset}
            className="hit text-[10px] text-accent font-medium px-2 py-1"
          >
            Cancel
          </button>
        )}
        {/* Own money between own accounts isn't a spend, so it has its own sheet rather than a step. */}
        {step === "details" && (
          <button
            type="button"
            onClick={() => {
              amountRef.current?.blur();
              setTransferOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg glass px-2.5 py-1.5 text-[11px] font-semibold text-accent"
          >
            <ArrowLeftRight className="h-3 w-3" /> Self transfer
          </button>
        )}
      </div>

      {step !== "done" && (
        <div className="flex gap-1">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1 flex-1 rounded-full",
                currentStep >= n ? "bg-accent" : "bg-black/10 dark:bg-white/10"
              )}
            />
          ))}
        </div>
      )}

      {/* The form is a card: each step turns it over to the next face rather
          than swapping the contents out. The first paint is instant. */}
      <div style={{ perspective: 1200 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={still ? false : { rotateY: 70, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={still ? undefined : { rotateY: -70, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            // No preserve-3d: inside a 3D context z-index stops working, and the
            // note suggestions would paint under the category tiles.
            style={{ transformOrigin: "50% 50%" }}
            className="space-y-3"
          >
      {step === "details" && notice ? (
        <div className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/10 px-3 py-2 text-[12px]">
          <RotateCcw className="h-3.5 w-3.5 shrink-0 text-positive" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-[11px] font-semibold text-accent">
            OK
          </button>
        </div>
      ) : null}
      {step === "details" && !refund && <DueBills person={expenseOwner === "both" ? "kushvanth" : (expenseOwner as Person)} />}
      {step === "details" && (
        <GlassCard strong className="space-y-3 !p-3">
          <div className="flex items-center justify-between">
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={openDatePicker}
                className="hit inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-black/5 dark:hover:bg-white/10"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {dateLabel}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
              {/* The real control sits under the button; the button just opens it. */}
              <input
                ref={dateRef}
                type="date"
                value={spendDate}
                max={todayIso()}
                onChange={(e) => e.target.value && setSpendDate(e.target.value)}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                tabIndex={-1}
                aria-label="Which day"
              />
            </span>
            {/* Same control as "Who paid?", so it reads as a choice, not a setting. */}
            <div className="glass flex gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="Spend or refund">
              <button
                type="button"
                role="radio"
                aria-checked={!refund}
                onClick={() => handleRefundChange(false)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                  !refund ? "bg-accent text-white shadow-sm" : "text-muted"
                )}
              >
                <ArrowUpRight className="h-3 w-3" /> Spent
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={refund}
                onClick={() => handleRefundChange(true)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                  refund ? "bg-positive text-white shadow-sm" : "text-muted"
                )}
              >
                <ArrowDownLeft className="h-3 w-3" /> Refund
              </button>
            </div>
          </div>

          {/* The amount in the middle of a ring of categories (Spend 6, "Dial"). */}
          <div className="space-y-1">
            <SpendDial
              amount={amount}
              amountRef={amountRef}
              onAmountChange={handleAmountChange}
              onAmountBlur={settleExpression}
              onEnter={handleDetailsNext}
              refund={refund}
              categories={orderedCategories.all}
              selectedId={selection?.categoryId ?? null}
              onSelect={selectCategory}
              onMore={() => setCategorySheet(true)}
              onAppendPlus={appendPlus}
              onOpenCalculator={openCalculator}
            />
            {hasOperator(amount) ? (
              <p className="text-center text-xs text-muted tabular-nums">= {formatCurrency(parsedAmount)}</p>
            ) : null}
            {selectedCategory?.budget ? (
              <BudgetBar
                spent={categorySpentThisMonth(transactions, selectedCategory.name)}
                budget={selectedCategory.budget}
                className="mx-auto max-w-[260px]"
              />
            ) : null}
            {refund ? (
              <p className="text-center text-[10px] text-positive">Goes back into the account it came from</p>
            ) : null}
            <div className="flex items-center justify-center gap-3 pt-0.5">
              <button
                type="button"
                onClick={() => setCategorySheet(true)}
                className="text-[11px] font-medium text-accent"
              >
                All {orderedCategories.all.length} categories
              </button>
              <span className="text-[11px] text-muted" aria-hidden>
                ·
              </span>
              <button type="button" onClick={() => setManageOpen(true)} className="text-[11px] font-medium text-accent">
                Manage categories
              </button>
            </div>
          </div>

          {/* The card gives each child z-index 1 (kg-spotlight), so the
              suggestion list needs its wrapper lifted above the siblings. */}
          <div className="relative" style={{ zIndex: 20 }}>
            <p className="text-[11px] text-muted px-1 mb-1">Note</p>
            <input
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              onFocus={() => setNotesFocused(true)}
              onBlur={() => setNotesFocused(false)}
              placeholder="What was it? e.g. Groceries at Costco"
              className="w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              autoComplete="off"
            />
            {suggestions.length > 0 ? (
              <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#03195b]">
                {suggestions.map((item) => (
                  <button
                    key={item.note}
                    type="button"
                    // Keep the input focused so the list does not vanish before the tap lands.
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(item.note, item.category)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.note}</span>
                    {item.category ? (
                      <span className="shrink-0 text-[10px] text-muted">{item.category}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-[11px] text-muted px-1 mb-1">Who is this for?</p>
              <div className="glass rounded-xl p-0.5 flex gap-0.5">
                {(
                  [
                    { id: "kushvanth" as ExpenseOwner, label: PERSON_LABELS.kushvanth },
                    { id: "g" as ExpenseOwner, label: PERSON_LABELS.g },
                    { id: "both" as ExpenseOwner, label: "Both" },
                  ]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleOwnerChange(id)}
                    className={segment(expenseOwner === id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sharedExpense && (
              <CompactSplitInputs
                kushLabel={`${PERSON_LABELS.kushvanth}'s part`}
                gLabel={`${PERSON_LABELS.g}'s part`}
                kushValue={expenseShareKush}
                gValue={expenseShareG}
                onKushChange={handleExpenseShareKushChange}
                onGChange={handleExpenseShareGChange}
                total={parsedAmount}
                kushAmt={expenseShareKushAmt}
                gAmt={expenseShareGAmt}
                valid={expenseSharesValid}
                remaining={expenseSplitRemaining}
                onEvenSplit={applyEvenExpenseSplitAction}
              />
            )}
          </div>

          {balancePreview && balancePreview.length > 0 && (
            <div className="rounded-xl bg-feature/5 border border-feature/20 px-3 py-2">
              <p className="text-[10px] font-semibold text-feature mb-0.5">Balance</p>
              {balancePreview.map((line) => (
                <p key={line} className="text-xs leading-snug">
                  {line}
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="text-[11px] text-muted px-1 mb-1">{refund ? "Who got it back?" : "Who paid?"}</p>
            <div className="glass rounded-xl p-0.5 flex gap-0.5">
              {(
                [
                  { id: "kushvanth" as PaidByMode, label: PERSON_LABELS.kushvanth },
                  { id: "g" as PaidByMode, label: PERSON_LABELS.g },
                  ...(refund ? [] : [{ id: "split" as PaidByMode, label: "Both paid" }]),
                ]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePaidByChange(id)}
                  className={segment(paidByMode === id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {paidByMode === "split" && (
              <div className="mt-2">
                <CompactSplitInputs
                  kushLabel={`${PERSON_LABELS.kushvanth} paid`}
                  gLabel={`${PERSON_LABELS.g} paid`}
                  kushValue={kushShare}
                  gValue={gShare}
                  onKushChange={handleKushShareChange}
                  onGChange={handleGShareChange}
                  total={parsedAmount}
                  kushAmt={kushAmount}
                  gAmt={gAmount}
                  valid={paymentSharesValid}
                  remaining={splitRemaining}
                  onEvenSplit={applyEvenSplit}
                />
              </div>
            )}
          </div>

          {/* It says what it is about to save, and once there is something to
              save it is held just above the tab bar on a phone instead of
              under it. Until then it waits at the end of the form, covering
              nothing you still have to fill in. */}
          <div
            {...(detailsReady ? { "data-action-bar": "" } : {})}
            className={cn(detailsReady && "kg-action-bar sticky bottom-[calc(6.9rem+env(safe-area-inset-bottom))] z-30 md:static")}
          >
            <GlassButton
              size="lg"
              className="w-full shadow-lg shadow-accent/20"
              disabled={!detailsReady}
              onClick={handleDetailsNext}
            >
              {parsedAmount <= 0
                ? "Type an amount"
                : !isCategoryValid
                  ? "Pick a category"
                  : !sharesValid
                    ? "Check the split"
                    : `Continue · ${formatAmount(parsedAmount)} · ${categoryLabel}`}
              <ArrowRight className="w-4 h-4" />
            </GlassButton>
          </div>
        </GlassCard>
      )}
      {step === "details" && <CategoryTypoHint />}

      {step === "payment" && (
        <div className="space-y-3">
          <GlassCard className="text-center py-2 px-3">
            <p className="text-xs text-muted truncate">{categoryLabel}{isToday ? "" : ` · ${dateLabel}`}</p>
            <p className={cn("text-2xl font-bold tabular-nums", refund && "text-positive")}>
              {refund ? "+" : ""}{formatCurrency(parsedAmount)}
            </p>
            <p className="text-[11px] text-muted mt-0.5">
              {refund
                ? `Back to ${PERSON_LABELS[paidByMode as Person]} · ${expenseOwnerLabel}`
                : paidByMode === "split"
                  ? `Both paid · ${expenseOwnerLabel}`
                  : `${PERSON_LABELS[paidByMode]} paid · ${expenseOwnerLabel}`}
            </p>
          </GlassCard>

          <p className="px-1 text-[11px] font-medium text-muted">
            {refund ? "Which account did it come back to?" : "Paid from which account?"}
          </p>

          {paidByMode === "split"
            ? activePayers.map((p) => renderAccountPicker(p))
            : renderAccountPicker(singlePayer!)}

          {splitReady && (
            <GlassButton size="lg" className="w-full" onClick={confirmSplit}>
              Confirm Payment
            </GlassButton>
          )}

          <GlassButton variant="ghost" className="w-full" onClick={() => setStep("details")}>
            Back
          </GlassButton>
        </div>
      )}

      {step === "cash-source" && pendingCashFor && (
        <div className="space-y-2">
          <GlassCard className="text-center py-3 px-3">
            <p className="text-sm font-semibold">Cash from which account?</p>
            <p className="text-xs text-muted">{PERSON_LABELS[pendingCashFor]}</p>
          </GlassCard>

          {getDebitAccounts(pendingCashFor).map((account) => (
            <GlassCard
              key={account.id}
              onClick={() => handleCashSource(account.id)}
              className="flex justify-between py-2.5 px-3 cursor-pointer"
            >
              <span className="text-sm font-medium">{account.name}</span>
              <span className="text-xs text-muted">{formatCurrency(account.balance)}</span>
            </GlassCard>
          ))}

          <GlassCard
            onClick={() => handleCashSource(null)}
            className="flex justify-between py-2.5 px-3 cursor-pointer"
          >
            <span className="text-sm font-medium">Existing Cash Wallet</span>
          </GlassCard>

          <GlassButton variant="ghost" className="w-full" onClick={() => setStep("payment")}>
            Back
          </GlassButton>
        </div>
      )}

      {step === "done" && saved && (
        <GlassCard strong className="text-center space-y-3 py-6 px-4">
          {/* Keyed on the amount so a second payment gets its own landing. */}
          <SpendDoneArt key={saved.amount} />
          <h3 className="text-lg font-semibold">{saved.refund ? "Refund Recorded" : "Payment Recorded"}</h3>
          <p className="text-sm text-muted tabular-nums">
            {saved.refund ? "+" : ""}{formatCurrency(saved.amount)} · {saved.category}
            {isToday ? "" : ` · ${dateLabel}`}
          </p>

          {/* Where it landed: the amount drops into the account it came from, and
              that balance rolls to its new figure — the same one Home shows. */}
          <div className="relative mx-auto max-w-xs">
            {still ? null : (
              <motion.span
                key={`drop-${saved.ids.join()}`}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-1/2 -top-5 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums shadow-md",
                  saved.refund ? "bg-positive text-white" : "bg-accent text-white"
                )}
                initial={{ y: -26, opacity: 0, scale: 0.8 }}
                animate={{ y: [-26, 0, 0, 22], opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.55] }}
                transition={{ duration: 1, times: [0, 0.3, 0.55, 1], ease: "easeInOut" }}
              >
                {saved.refund ? "+" : "-"}
                {formatAmount(saved.amount)}
              </motion.span>
            )}
          <div className="space-y-1 rounded-xl bg-black/[0.04] px-3 py-2 text-left text-[12px] dark:bg-white/[0.06]">
            {savedAccounts.map((account) => (
              <p key={account.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted">
                  {account.name} {account.type === "credit" ? "balance" : "now"}
                </span>
                <RollingMoney
                  from={saved.before[account.id] ?? account.balance}
                  to={account.balance}
                  className="font-semibold"
                />
              </p>
            ))}
            <p className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                {betweenNow.amount > 0 ? betweenNow.label.replace(" should pay ", " owes ").replace(" back", "") : "Balance"}
              </span>
              <span className="font-semibold tabular-nums text-feature">
                {betweenNow.amount > 0 ? formatCurrency(betweenNow.amount) : "settled"}
              </span>
            </p>
          </div>
          </div>

          {undoLeft > 0 ? (
            <button
              type="button"
              onClick={undo}
              className="hit inline-flex items-center gap-1.5 rounded-xl border border-caution/40 bg-caution/10 px-3 py-1.5 text-[12px] font-semibold text-caution"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo · {undoLeft}s
            </button>
          ) : (
            <p className="text-[10px] text-muted">To take it back now, delete it from History.</p>
          )}

          <GlassButton size="lg" className="w-full" onClick={reset}>
            New Payment
          </GlassButton>
        </GlassCard>
      )}
          </motion.div>
        </AnimatePresence>
      </div>

      <SpendCategoryManager
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onCategoryDeleted={handleCategoryDeleted}
      />

      {/* Every category, the tiles from before: recent ones first, budgets on each. */}
      <GlassModal open={categorySheet} onClose={() => setCategorySheet(false)} title="All categories">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5 p-0.5">
            {orderedCategories.all.map((category) => (
              <CategoryButton
                key={category.id}
                label={category.name}
                sub={keywordsSubLine(category)}
                look={categoryLook(category)}
                tag={orderedCategories.lead.includes(category) ? "Recent" : undefined}
                selected={selection?.categoryId === category.id}
                onClick={() => {
                  selectCategory(category);
                  setCategorySheet(false);
                }}
                budget={
                  category.budget
                    ? { spent: categorySpentThisMonth(transactions, category.name), budget: category.budget }
                    : undefined
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setCategorySheet(false);
              setManageOpen(true);
            }}
            className="w-full text-center text-[12px] font-semibold text-accent"
          >
            Manage categories
          </button>
        </div>
      </GlassModal>

      {/* Mounted only while open, so each opening starts from what the amount says now. */}
      {calculatorFrom !== null ? (
        <AmountCalculator
          open
          initial={calculatorFrom}
          onClose={() => setCalculatorFrom(null)}
          onUse={handleAmountChange}
        />
      ) : null}

      {transferOpen ? (
        <SelfTransferSheet
          person={paidByMode === "split" ? "kushvanth" : paidByMode}
          onClose={() => setTransferOpen(false)}
          onDone={(id) => {
            const row = useFinanceStore.getState().transactions.find((t) => t.id === id);
            if (row) setNotice(`${row.autoMessage ?? "Moved between accounts"}. It's in History; nothing was counted as spending.`);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={duplicate !== null}
        title="Looks like you just logged this"
        message={
          duplicate
            ? `${formatCurrency(Math.abs(duplicate.prior.amount))} · ${duplicate.prior.category ?? "Other"} was recorded ${duplicate.ago}. Record it again?`
            : ""
        }
        confirmLabel="Log again"
        cancelLabel="Skip it"
        destructive={false}
        onConfirm={() => {
          const run = duplicate?.run;
          setDuplicate(null);
          run?.();
        }}
        onCancel={() => {
          setDuplicate(null);
          reset();
          setNotice("Skipped — the earlier one is still recorded.");
        }}
      />
    </div>
  );
}

function describeAgo(transaction: Transaction): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - parseAppDateTime(transaction.date, transaction.time, transaction.timestamp).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
}

function CompactSplitInputs({
  kushLabel,
  gLabel,
  kushValue,
  gValue,
  onKushChange,
  onGChange,
  total,
  kushAmt,
  gAmt,
  valid,
  remaining,
  onEvenSplit,
}: {
  kushLabel: string;
  gLabel: string;
  kushValue: string;
  gValue: string;
  onKushChange: (val: string) => void;
  onGChange: (val: string) => void;
  total: number;
  kushAmt: number;
  gAmt: number;
  valid: boolean;
  remaining: number;
  onEvenSplit: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted px-0.5 truncate">{kushLabel}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={kushValue}
            onChange={(e) => onKushChange(e.target.value)}
            placeholder="0"
            className="glass rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted px-0.5 truncate">{gLabel}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={gValue}
            onChange={(e) => onGChange(e.target.value)}
            placeholder="0"
            className="glass rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>
      {total > 0 && (
        <>
          <div className="flex items-center justify-between px-0.5 text-[10px]">
            <span className="text-muted">
              {formatCurrency(kushAmt + gAmt)} / {formatCurrency(total)}
            </span>
            {!valid ? (
              <span className="text-negative font-medium">
                {remaining > 0
                  ? `${formatCurrency(remaining)} left`
                  : `${formatCurrency(Math.abs(remaining))} over`}
              </span>
            ) : (
              <span className="text-positive font-medium">✓</span>
            )}
          </div>
          <button
            type="button"
            onClick={onEvenSplit}
            className="text-[10px] text-accent font-medium px-0.5"
          >
            {(() => {
              const [a, b] = splitMoney(total, 2);
              return a === b
                ? `50 / 50 (${formatCurrency(a)} each)`
                : `50 / 50 (${formatCurrency(a)} / ${formatCurrency(b)})`;
            })()}
          </button>
        </>
      )}
    </div>
  );
}

function CategoryButton({
  label,
  sub,
  look,
  tag,
  selected,
  onClick,
  budget,
}: {
  label: string;
  sub: string | null;
  look: { emoji: string; color: string };
  tag?: string;
  selected: boolean;
  onClick: () => void;
  /** Present when the category has a monthly budget to show against. */
  budget?: { spent: number; budget: number };
}) {
  // Inline because .glass sets its own border, background and shadow outside
  // the utility layer; the chosen tile takes the category colour as a 1px edge
  // and a wash, which nothing can clip.
  const chosen: CSSProperties = selected
    ? {
        borderColor: look.color,
        boxShadow: `inset 0 0 0 1px ${look.color}`,
        background: `${look.color}24`,
      }
    : {};

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={chosen}
      className={cn(
        "glass relative rounded-xl px-2 py-2 text-left text-xs transition-all min-h-[52px] flex flex-col justify-between",
        !selected && "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      )}
    >
      <div className="flex items-start justify-between gap-1 w-full">
        <p className="flex min-w-0 items-center gap-1.5 font-medium leading-tight text-[11px]">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px]"
            style={{ background: `${look.color}22` }}
            aria-hidden
          >
            {look.emoji}
          </span>
          <span className={cn("line-clamp-2", selected && "font-semibold")}>{label}</span>
        </p>
        {selected ? (
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: look.color }}
            aria-hidden
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : tag ? (
          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md shrink-0 bg-black/5 dark:bg-white/10 text-muted">
            {tag}
          </span>
        ) : null}
      </div>
      {sub ? <p className="text-[10px] mt-1 text-muted truncate">{sub}</p> : null}
      {budget ? <BudgetBar spent={budget.spent} budget={budget.budget} compact className="mt-1.5" /> : null}
    </button>
  );
}
