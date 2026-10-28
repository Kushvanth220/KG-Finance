"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { zonedToday, zonedYesterday } from "@/lib/zoned-date";
import { ArrowLeftRight, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassModal } from "@/components/ui/glass-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { useFinanceStore } from "@/store/finance-store";
import { getMonthlyIncome, getWeeklyIncome } from "@/lib/calculations";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { formatAmount, formatCurrency, formatDateTime } from "@/lib/formatters";
import { getAccountsForPerson, getGreenDotParts, isGreenDotPart } from "@/lib/accounts";
import { AccountEditor } from "@/components/accounts/account-editor";
import { SelfTransferSheet } from "@/components/accounts/self-transfer-sheet";
import { WalletStack } from "@/components/accounts/wallet-stack";
import { roundMoney } from "@/lib/money";
import { useQuickAction } from "@/lib/quick-actions";
import { CREDIT_LABELS } from "@/lib/settlement";
import { type Account, type Person } from "@/types";
import { cn } from "@/lib/utils";

export default function AccountsPage() {
  const {
    accounts,
    debts,
    transactions,
    incomeSources,
    incomeEntries,
    adjustAccountBalance,
    addAccount,
    updateAccount,
    deleteAccount,
    addIncome,
    addIncomeSource,
    updateIncomeSource,
    deleteIncomeSource,
    deleteIncome,
  } = useFinanceStore();

  const [person, setPerson] = useState<Person>("kushvanth");
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [depositAccount, setDepositAccount] = useState<Account | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);

  const [newBalance, setNewBalance] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [depositSourceId, setDepositSourceId] = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  // Money often gets logged a day or two after it landed, so the date is
  // editable rather than assumed. Defaults to today in the workspace's
  // timezone — a browser-local "today" is already tomorrow late in the evening.
  const [depositDate, setDepositDate] = useState(zonedToday());
  // Creating a card used to be possible only by asking the assistant.
  const [accountEditor, setAccountEditor] = useState<{ account?: Account } | null>(null);
  // A self transfer in progress, starting from this account when one is named.
  const [transfer, setTransfer] = useState<{ from?: string } | null>(null);
  // Press and hold Spend in the tab bar → Self transfer.
  useQuickAction("transfer", () => setTransfer({}));

  const [sourceName, setSourceName] = useState("");
  const [editSourceId, setEditSourceId] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const personAccounts = getAccountsForPerson(accounts, person);
  // The Green Dot card shows on both tabs, standing on this person's part —
  // or, when they have none, on the other's, so the card is never missing.
  const greenDotParts = useMemo(() => getGreenDotParts(accounts), [accounts]);
  const stackAccounts =
    greenDotParts.length === 0 || personAccounts.some(isGreenDotPart)
      ? personAccounts
      : [...personAccounts, greenDotParts[0]!];
  const personSources = incomeSources.filter((s) => s.person === person);
  const personEntries = useMemo(
    () =>
      incomeEntries
        .filter((e) => e.person === person)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "")),
    [incomeEntries, person]
  );

  const monthlyIncome = getMonthlyIncome(incomeEntries, person);
  const weeklyIncome = getWeeklyIncome(incomeEntries, person);

  const resetDepositForm = () => {
    setDepositAmount("");
    setDepositSourceId("");
    setDepositNotes("");
    setDepositDate(zonedToday());
    setDepositAccount(null);
  };

  const resetAdjustForm = () => {
    setEditAccount(null);
    setNewBalance("");
    setNewLimit("");
    setAdjustNotes("");
  };

  const openDeposit = (account: Account) => {
    setDepositAccount(account);
    setDepositAmount("");
    setDepositSourceId("");
    setDepositNotes("");
  };

  const openAdjust = (account: Account) => {
    setEditAccount(account);
    setNewBalance(String(account.balance));
    setNewLimit(String(account.creditLimit ?? ""));
    setAdjustNotes("");
  };

  const handleSaveCreditBalance = () => {
    if (!editAccount) return;
    const balance = parseFloat(newBalance);
    if (isNaN(balance)) return;

    adjustAccountBalance(editAccount.id, balance, adjustNotes || "Credit balance update");

    if (editAccount.type === "credit" && newLimit) {
      updateAccount(editAccount.id, { creditLimit: parseFloat(newLimit) });
    }

    resetAdjustForm();
  };

  const handleDeposit = () => {
    if (!depositAccount) return;
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0 || !depositSourceId) return;

    addIncome({
      person,
      sourceId: depositSourceId,
      amount,
      date: depositDate || zonedToday(),
      notes: depositNotes.trim() || undefined,
      depositType: depositAccount.type === "cash" ? "cash" : "debit",
      depositAccountId: depositAccount.id,
    });

    resetDepositForm();
  };

  const handleAddSource = () => {
    if (!sourceName.trim()) return;
    if (editSourceId) {
      updateIncomeSource(editSourceId, sourceName.trim());
    } else {
      addIncomeSource(person, sourceName.trim());
    }
    setSourceName("");
    setEditSourceId(null);
    setShowAddSource(false);
  };

  const handleDeleteAccount = (account: Account) => {
    const linkedDebt = debts.some((d) => d.linkedAccountId === account.id);
    if (linkedDebt) {
      setBlockedMessage(
        `${account.name} is linked to a debt. Clear or unlink that debt first, then delete the account.`
      );
      return;
    }
    setPendingDelete({
      title: "Delete account?",
      message: `${account.name} will be removed. Its past transactions stay in History but will no longer show an account name.`,
      confirmLabel: "Delete account",
      run: () => deleteAccount(account.id),
    });
  };

  const confirmDeleteSource = (source: { id: string; name: string }) => {
    const linkedEntries = incomeEntries.filter((e) => e.sourceId === source.id).length;
    setPendingDelete({
      title: "Delete income source?",
      message: linkedEntries
        ? `"${source.name}" is used by ${linkedEntries} income ${linkedEntries === 1 ? "entry" : "entries"}. Those entries stay, but will show as "Unknown". Balances are not changed.`
        : `"${source.name}" will be removed. Balances are not changed.`,
      confirmLabel: "Delete source",
      run: () => deleteIncomeSource(source.id),
    });
  };

  const confirmDeleteIncome = (entry: { id: string; amount: number }) => {
    setPendingDelete({
      title: "Delete this income?",
      message: `${formatCurrency(entry.amount)} will be removed from the account balance and its History entry deleted. This is saved to the deleted log.`,
      confirmLabel: "Delete income",
      run: () => deleteIncome(entry.id, person),
    });
  };

  const getDepositLabel = (accountId: string, depositType: "cash" | "debit") => {
    if (depositType === "cash") return "Cash Wallet";
    return accounts.find((a) => a.id === accountId)?.name ?? "Account";
  };

  return (
    <CompactPageShell
      title="Accounts"
      subtitle="Cards, banks and cash — and where income lands"
      person={person}
      onPersonChange={setPerson}
      action={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTransfer({})}
            className="inline-flex items-center gap-1 rounded-lg glass px-2.5 py-1.5 text-[11px] font-semibold text-accent"
          >
            <ArrowLeftRight className="w-3 h-3" /> Self transfer
          </button>
          <button
            type="button"
            onClick={() => setAccountEditor({})}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white"
          >
            <Plus className="w-3 h-3" /> Add account
          </button>
        </div>
      }
    >
      {/* What is left once every card is paid, with held and owed named apart:
          they point opposite ways, so neither is folded into the other unseen. */}
      {(() => {
        const sum = (types: string[]) =>
          roundMoney(personAccounts.filter((a) => types.includes(a.type)).reduce((t, a) => t + a.balance, 0));
        const held = sum(["debit", "cash"]);
        const owed = sum(["credit"]);
        return (
          <GlassCard className="!p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">After every card is paid</p>
            <AnimatedMoney value={roundMoney(held - owed)} className="block text-3xl font-semibold tabular-nums" />
            <p className="mt-0.5 text-[11px] tabular-nums">
              <span className="text-positive">{formatCurrency(held)} held</span>
              <span className="text-muted"> · </span>
              <span className="text-negative">{formatCurrency(owed)} owed</span>
            </p>
          </GlassCard>
        );
      })()}

      <WalletStack
        accounts={stackAccounts}
        greenDotParts={greenDotParts}
        transactions={transactions}
        onAddAccount={() => setAccountEditor({})}
        onAddMoney={openDeposit}
        onTransfer={(account) => setTransfer({ from: account.id })}
        onAdjust={openAdjust}
        onRename={(account) => setAccountEditor({ account })}
        onDelete={handleDeleteAccount}
      />

      <GlassCard className="!p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-positive" />
          <p className="text-xs font-semibold">Income summary</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">This month</p>
            <p className="text-lg font-bold text-positive tabular-nums">+{formatCurrency(monthlyIncome)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide">This week</p>
            <p className="text-lg font-bold text-positive tabular-nums">+{formatCurrency(weeklyIncome)}</p>
          </div>
        </div>
      </GlassCard>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <p className="text-xs font-semibold">Income sources</p>
          <button
            type="button"
            onClick={() => setShowAddSource(true)}
            className="text-[10px] text-accent font-medium"
          >
            + Add source
          </button>
        </div>
        <div className="divide-y divide-black/5 dark:divide-white/10">
          {personSources.length === 0 ? (
            <p className="text-xs text-muted px-3 py-3">Add sources like On campus, Gas station, Salary</p>
          ) : (
            personSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between px-3 py-2 gap-2">
                <span className="text-xs font-medium">{source.name}</span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => {
                      setEditSourceId(source.id);
                      setSourceName(source.name);
                      setShowAddSource(true);
                    }}
                    className="tap-icon focus-ring p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted" />
                  </button>
                  <button
                    onClick={() => confirmDeleteSource(source)}
                    className="tap-icon focus-ring p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                    aria-label={`Delete income source ${source.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-negative" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-black/5 dark:border-white/10">
          <p className="text-xs font-semibold">Recent income</p>
        </div>
        {personEntries.length === 0 ? (
          <p className="text-xs text-muted p-4 text-center">Add money to a debit or cash account to record income</p>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {personEntries.slice(0, 8).map((entry) => {
              const source = incomeSources.find((s) => s.id === entry.sourceId);
              return (
                <div key={entry.id} className="flex items-center justify-between px-3 py-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{source?.name ?? "Unknown"}</p>
                    <p className="text-[10px] text-muted truncate">
                      {formatDateTime(entry.date, entry.time, entry.timestamp)} ·{" "}
                      {getDepositLabel(entry.depositAccountId, entry.depositType)}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-semibold text-positive tabular-nums">
                      +{formatAmount(entry.amount)}
                    </span>
                    <button
                      onClick={() => confirmDeleteIncome(entry)}
                      className="tap-icon focus-ring p-1 rounded-lg hover:bg-black/5"
                      aria-label={`Delete income of ${formatCurrency(entry.amount)}`}
                    >
                      <Trash2 className="w-3 h-3 text-negative" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {accountEditor ? (
        <AccountEditor
          open
          initial={accountEditor.account}
          defaultPerson={person}
          onClose={() => setAccountEditor(null)}
          onSave={(draft) => {
            if (accountEditor.account) {
              // Renaming and reassigning only — the balance is left alone, so
              // it can never be edited without an adjustment being recorded.
              const rest = { ...draft };
              delete (rest as Partial<typeof rest>).balance;
              updateAccount(accountEditor.account.id, rest);
            } else {
              addAccount(draft);
            }
            setAccountEditor(null);
          }}
        />
      ) : null}

      <GlassModal
        open={!!depositAccount}
        onClose={resetDepositForm}
        title={`Add money · ${depositAccount?.name}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Where did this money come from? It will be added to the account and saved in History.
          </p>
          <GlassInput
            label="Amount"
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="0.00"
          />
          <div>
            <label className="text-sm font-medium text-muted px-1">Income source</label>
            <select
              value={depositSourceId}
              onChange={(e) => setDepositSourceId(e.target.value)}
              className="glass rounded-2xl px-4 py-3 w-full mt-1.5 outline-none"
            >
              <option value="">Select source</option>
              {personSources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {personSources.length === 0 && (
              <button
                type="button"
                onClick={() => setShowAddSource(true)}
                className="text-[11px] text-accent font-medium mt-2 px-1"
              >
                + Add your first income source
              </button>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-muted px-1">When did you get it?</label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="date"
                value={depositDate}
                max={zonedToday()}
                onChange={(e) => setDepositDate(e.target.value)}
                className="glass rounded-2xl px-4 py-3 flex-1 outline-none"
              />
            </div>
            <div className="mt-2 flex gap-1.5">
              {[
                { label: "Today", value: zonedToday() },
                { label: "Yesterday", value: zonedYesterday() },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setDepositDate(option.value)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    depositDate === option.value
                      ? "bg-positive text-white"
                      : "glass text-muted hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <GlassInput
            label="Note (optional)"
            value={depositNotes}
            onChange={(e) => setDepositNotes(e.target.value)}
            placeholder="e.g. Campus job shift, gas station refund"
          />
          {depositAccount && depositAmount && parseFloat(depositAmount) > 0 && depositSourceId && (
            <div className="rounded-xl bg-positive/5 border border-positive/20 px-3 py-2 text-xs">
              <p>
                {personSources.find((s) => s.id === depositSourceId)?.name} →{" "}
                {formatCurrency(parseFloat(depositAmount))} into {depositAccount.name}
                {depositDate && depositDate !== zonedToday()
                  ? ` on ${format(new Date(`${depositDate}T12:00:00`), "EEE d MMM")}`
                  : ""}
              </p>
            </div>
          )}
          <GlassButton
            className="w-full"
            onClick={handleDeposit}
            disabled={!depositAmount || parseFloat(depositAmount) <= 0 || !depositSourceId}
          >
            Add & record income
          </GlassButton>
        </div>
      </GlassModal>

      <GlassModal
        open={!!editAccount}
        onClose={resetAdjustForm}
        title={`Adjust ${editAccount?.name}`}
      >
        <div className="space-y-4">
          {editAccount && (editAccount.type === "debit" || editAccount.type === "cash") && (
            <p className="text-xs text-muted">
              To add money with an income source, use <strong>Add money</strong> instead. Use this only to fix the balance.
            </p>
          )}
          <GlassInput
            label={editAccount?.type === "credit" ? CREDIT_LABELS.currentBalance : "Balance"}
            type="number"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
          />
          {editAccount?.type === "credit" && (
            <GlassInput
              label={CREDIT_LABELS.limit}
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
            />
          )}
          <GlassInput
            label="Reason"
            value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)}
            placeholder="e.g. Balance correction"
          />
          <GlassButton className="w-full" onClick={handleSaveCreditBalance}>
            Save adjustment
          </GlassButton>
        </div>
      </GlassModal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        message={pendingDelete?.message ?? ""}
        confirmLabel={pendingDelete?.confirmLabel}
        onConfirm={() => {
          pendingDelete?.run();
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={blockedMessage !== null}
        title="Can't delete this account"
        message={blockedMessage ?? ""}
        confirmLabel="Got it"
        destructive={false}
        cancelLabel="Close"
        onConfirm={() => setBlockedMessage(null)}
        onCancel={() => setBlockedMessage(null)}
      />

      <GlassModal
        open={showAddSource}
        onClose={() => { setShowAddSource(false); setEditSourceId(null); setSourceName(""); }}
        title={editSourceId ? "Edit source" : "Add income source"}
      >
        <div className="space-y-4">
          <GlassInput
            label="Source name"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. On campus, Gas station, Salary"
          />
          <GlassButton className="w-full" onClick={handleAddSource}>
            {editSourceId ? "Save" : "Add source"}
          </GlassButton>
        </div>
      </GlassModal>

      {transfer ? (
        <SelfTransferSheet person={person} fromAccountId={transfer.from} onClose={() => setTransfer(null)} />
      ) : null}
    </CompactPageShell>
  );
}
