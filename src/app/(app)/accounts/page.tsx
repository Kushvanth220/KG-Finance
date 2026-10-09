"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { zonedToday, zonedYesterday } from "@/lib/zoned-date";
import {
  Banknote,
  CreditCard,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassModal } from "@/components/ui/glass-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { useFinanceStore } from "@/store/finance-store";
import {
  getAvailableCredit,
  getCreditUtilization,
  getMonthlyIncome,
  getWeeklyIncome,
} from "@/lib/calculations";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/formatters";
import { getAccountsForPerson, isSharedAccount } from "@/lib/accounts";
import { SharedAccountActivity } from "@/components/accounts/shared-account-activity";
import { AccountEditor } from "@/components/accounts/account-editor";
import { Tilt3D } from "@/components/art/tilt-3d";
import { BankCardFace } from "@/components/art/page-art";
import { Wallet as WalletIcon, CreditCard as CreditCardIcon } from "lucide-react";
import { roundMoney } from "@/lib/money";
import { CREDIT_LABELS } from "@/lib/settlement";
import { type Account, type Person } from "@/types";
import { cn } from "@/lib/utils";

const typeIcons = {
  credit: CreditCard,
  debit: Wallet,
  cash: Banknote,
};

export default function AccountsPage() {
  const {
    accounts,
    debts,
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
        <button
          type="button"
          onClick={() => setAccountEditor({})}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          <Plus className="w-3 h-3" /> Add account
        </button>
      }
    >
      {/* Held and owed as two cards — separate, because they point opposite
          ways and one box would invite the eye to add them. */}
      {(() => {
        const mine = getAccountsForPerson(accounts, person);
        const sum = (types: string[]) =>
          roundMoney(mine.filter((a) => types.includes(a.type)).reduce((t, a) => t + a.balance, 0));
        const held = sum(["debit", "cash"]);
        const owed = sum(["credit"]);
        const cards = mine.filter((a) => a.type === "credit").length;
        const banks = mine.length - cards;
        return (
          <div className="grid grid-cols-2 gap-2">
            <Tilt3D max={9}>
              <BankCardFace
                label="Available"
                amount={held}
                sub={`${banks} ${banks === 1 ? "account" : "accounts"}`}
                tint="#1f9d4a"
                icon={<WalletIcon className="h-5 w-5" />}
              />
            </Tilt3D>
            <Tilt3D max={9}>
              <BankCardFace
                label="Owed on cards"
                amount={owed}
                sub={`${cards} ${cards === 1 ? "card" : "cards"}`}
                tint="#c9302c"
                icon={<CreditCardIcon className="h-5 w-5" />}
              />
            </Tilt3D>
          </div>
        );
      })()}

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

      {(["credit", "debit", "cash"] as const).map((type) => {
        const typeAccounts = personAccounts.filter((a) => a.type === type);
        if (typeAccounts.length === 0) return null;
        const Icon = typeIcons[type];
        const typeLabel =
          type === "credit" ? "Credit Cards" : type === "debit" ? "Debit Accounts" : "Cash";

        return (
          <div key={type} className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-muted flex items-center gap-1.5 px-1 uppercase tracking-wide">
              <Icon className="w-3 h-3" /> {typeLabel}
            </h3>
            {typeAccounts.map((account) => (
              <GlassCard key={account.id} className="!p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                      {account.name}
                      {isSharedAccount(account) ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-feature/15 text-feature">
                          Shared
                        </span>
                      ) : null}
                    </p>
                    {isSharedAccount(account) ? (
                      <p className="text-[10px] text-muted">Both of you use this account</p>
                    ) : null}
                    {account.type === "credit" && account.creditLimit != null && (
                      <p className="text-xs text-muted">
                        Limit: {formatCurrency(account.creditLimit)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {(account.type === "debit" || account.type === "cash") && (
                      <GlassButton
                        size="sm"
                        onClick={() => {
                          setDepositAccount(account);
                          setDepositAmount("");
                          setDepositSourceId("");
                          setDepositNotes("");
                        }}
                      >
                        <Plus className="w-3 h-3" /> Add money
                      </GlassButton>
                    )}
                    <button
                      onClick={() => setAccountEditor({ account })}
                      aria-label={`Edit ${account.name}`}
                      title={`Rename ${account.name}`}
                      className="tap-icon focus-ring p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted" />
                    </button>
                    <button
                      onClick={() => {
                        setEditAccount(account);
                        setNewBalance(String(account.balance));
                        setNewLimit(String(account.creditLimit ?? ""));
                        setAdjustNotes("");
                      }}
                      className="tap-icon focus-ring p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
                      title={account.type === "credit" ? "Update balance" : "Adjust balance"}
                    >
                      <Pencil className="w-4 h-4 text-muted" />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(account)}
                      className="tap-icon focus-ring p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
                      aria-label={`Delete account ${account.name}`}
                      title={`Delete ${account.name}`}
                    >
                      <Trash2 className="w-4 h-4 text-negative" />
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted">
                      {account.type === "credit" ? CREDIT_LABELS.cardBalance : "Balance"}
                    </p>
                    <AnimatedMoney value={account.balance} className="block text-2xl font-bold kg-figure" />
                  </div>
                  {account.type === "credit" && account.creditLimit != null && (
                    <div className="text-right">
                      <p className="text-xs text-muted">{CREDIT_LABELS.leftToSpend}</p>
                      <p className="font-semibold text-positive">
                        {formatCurrency(getAvailableCredit(account))}
                      </p>
                      <div className="mt-2 w-24 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{
                            width: `${Math.min(100, getCreditUtilization(account))}%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">
                        {formatPercent(getCreditUtilization(account))} {CREDIT_LABELS.percentUsed}
                      </p>
                    </div>
                  )}
                </div>

                {isSharedAccount(account) ? (
                  <SharedAccountActivity accountId={account.id} accountName={account.name} />
                ) : null}
              </GlassCard>
            ))}
          </div>
        );
      })}

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
                      +{formatCurrency(entry.amount)}
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
    </CompactPageShell>
  );
}
