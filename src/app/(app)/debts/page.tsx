"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassModal } from "@/components/ui/glass-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { Tilt3D } from "@/components/art/tilt-3d";
import { useFinanceStore } from "@/store/finance-store";
import { getPersonDebtOutstandingSummary } from "@/lib/calculations";
import { formatCurrency } from "@/lib/formatters";
import type { Debt, Person } from "@/types";
import { cn } from "@/lib/utils";

export default function DebtsPage() {
  const {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    recordDebtPayment,
    markDebtCleared,
  } = useFinanceStore();

  const [person, setPerson] = useState<Person>("kushvanth");
  const [showAdd, setShowAdd] = useState(false);
  const [payDebtId, setPayDebtId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCleared, setShowCleared] = useState(false);

  const [pendingDeleteDebt, setPendingDeleteDebt] = useState<Debt | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [debtNotes, setDebtNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const summary = useMemo(
    () => getPersonDebtOutstandingSummary(debts, person),
    [debts, person]
  );

  const payingDebt = payDebtId ? debts.find((d) => d.id === payDebtId) : null;
  const parsedPayAmount = parseFloat(payAmount) || 0;
  const payRemaining = payingDebt
    ? Math.max(0, payingDebt.amount - Math.min(parsedPayAmount, payingDebt.amount))
    : 0;

  const resetForm = () => {
    setName("");
    setAmount("");
    setDebtNotes("");
    setEditId(null);
  };

  const resetPayForm = () => {
    setPayAmount("");
    setPayNotes("");
    setPayDebtId(null);
  };

  const openPayModal = (debt: Debt) => {
    setPayDebtId(debt.id);
    setPayAmount("");
    setPayNotes("");
  };

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!name.trim() || isNaN(parsed) || parsed < 0) return;

    if (editId) {
      updateDebt(editId, {
        name: name.trim(),
        amount: parsed,
        notes: debtNotes.trim() || undefined,
      });
    } else {
      addDebt({
        person,
        name: name.trim(),
        amount: parsed,
        notes: debtNotes.trim() || undefined,
      });
    }
    resetForm();
    setShowAdd(false);
  };

  const handleRecordPayment = () => {
    if (!payDebtId || parsedPayAmount <= 0) return;
    recordDebtPayment(payDebtId, parsedPayAmount, payNotes.trim() || undefined);
    resetPayForm();
  };

  const handleMarkCleared = (debtId: string) => {
    markDebtCleared(debtId, payNotes.trim() || undefined);
    resetPayForm();
  };

  return (
    <CompactPageShell
      title="Debts"
      subtitle="Track what you owe and to whom"
      person={person}
      onPersonChange={setPerson}
      action={
        <GlassButton size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add
        </GlassButton>
      }
    >
      <Tilt3D max={7} className="rounded-[var(--card-radius)]">
      <GlassCard className="!p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted">Total outstanding</p>
            <p className="text-2xl font-bold text-[#ff3b30] tabular-nums">
              {formatCurrency(summary.total)}
            </p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[11px] text-muted">
              {summary.activeCount} open {summary.activeCount === 1 ? "debt" : "debts"}
            </p>
            {summary.creditCardBills > 0 && (
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-[#ff9500]">
                <CreditCard className="w-3 h-3" />
                {summary.creditCardBills} card {summary.creditCardBills === 1 ? "bill" : "bills"}
              </p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          Use this like a note — add who you owe, record partial payments, or mark a debt cleared when it is paid off.
        </p>
      </GlassCard>
      </Tilt3D>

      <div className="space-y-2">
        {summary.activeDebts.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No open debts</p>
        ) : (
          summary.activeDebts.map((debt) => (
            <DebtNoteCard
              key={debt.id}
              debt={debt}
              onPay={() => openPayModal(debt)}
              onClear={() => markDebtCleared(debt.id)}
              onEdit={() => {
                setEditId(debt.id);
                setName(debt.name);
                setAmount(String(debt.amount));
                setDebtNotes(debt.notes ?? "");
                setShowAdd(true);
              }}
              onDelete={() => setPendingDeleteDebt(debt)}
            />
          ))
        )}
      </div>

      {summary.clearedDebts.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowCleared((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted px-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#34c759]" />
            {summary.clearedDebts.length} cleared
            <span className="text-[10px]">{showCleared ? "Hide" : "Show"}</span>
          </button>
          {showCleared &&
            summary.clearedDebts.map((debt) => (
              <GlassCard key={debt.id} className="!p-3 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate line-through">{debt.name}</p>
                    {debt.notes && (
                      <p className="text-[10px] text-muted truncate">{debt.notes}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-[#34c759] shrink-0">Cleared</span>
                </div>
                <div className="flex justify-end mt-2">
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDeleteDebt(debt)}
                    aria-label={`Delete cleared debt ${debt.name}`}
                  >
                    <Trash2 className="w-3 h-3 text-[#ff3b30]" />
                  </GlassButton>
                </div>
              </GlassCard>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteDebt !== null}
        title="Delete debt note?"
        message={
          pendingDeleteDebt
            ? `"${pendingDeleteDebt.name}"${
                pendingDeleteDebt.amount > 0
                  ? ` still shows ${formatCurrency(pendingDeleteDebt.amount)} outstanding`
                  : " (already cleared)"
              } will be removed. Past payments stay in History.`
            : ""
        }
        confirmLabel="Delete debt"
        onConfirm={() => {
          if (pendingDeleteDebt) deleteDebt(pendingDeleteDebt.id);
          setPendingDeleteDebt(null);
        }}
        onCancel={() => setPendingDeleteDebt(null)}
      />

      <GlassModal
        open={showAdd}
        onClose={() => { setShowAdd(false); resetForm(); }}
        title={editId ? "Edit debt note" : "Add debt note"}
      >
        <div className="space-y-4">
          <GlassInput
            label="Who do you owe?"
            placeholder="e.g. Zolve, Dhamodhar, Chase card"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <GlassInput
            label="Amount owed"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <GlassInput
            label="Note (optional)"
            placeholder="What is this for?"
            value={debtNotes}
            onChange={(e) => setDebtNotes(e.target.value)}
          />
          <GlassButton className="w-full" onClick={handleSave}>
            {editId ? "Save" : "Add debt"}
          </GlassButton>
        </div>
      </GlassModal>

      <GlassModal
        open={!!payDebtId}
        onClose={resetPayForm}
        title={payingDebt ? `Record payment · ${payingDebt.name}` : "Record payment"}
      >
        {payingDebt && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/20 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Currently owed</span>
                <span className="font-semibold text-[#ff3b30]">
                  {formatCurrency(payingDebt.amount)}
                </span>
              </div>
            </div>

            <GlassInput
              label="Amount cleared now"
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Enter how much you paid"
            />

            {parsedPayAmount > 0 && (
              <div className="rounded-xl bg-[#007aff]/5 border border-[#007aff]/20 px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted">Clearing now</span>
                  <span className="font-semibold">
                    {formatCurrency(Math.min(parsedPayAmount, payingDebt.amount))}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted">Remaining after</span>
                  <span className={cn("font-semibold", payRemaining <= 0 ? "text-[#34c759]" : "text-[#ff9500]")}>
                    {payRemaining <= 0 ? "Fully cleared" : formatCurrency(payRemaining)}
                  </span>
                </div>
              </div>
            )}

            <GlassInput
              label="Note (optional)"
              placeholder="e.g. Paid half this month"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <GlassButton
                variant="secondary"
                onClick={() => handleRecordPayment()}
                disabled={parsedPayAmount <= 0}
              >
                Save partial
              </GlassButton>
              <GlassButton onClick={() => handleMarkCleared(payingDebt.id)}>
                Mark cleared
              </GlassButton>
            </div>
          </div>
        )}
      </GlassModal>
    </CompactPageShell>
  );
}

function DebtNoteCard({
  debt,
  onPay,
  onClear,
  onEdit,
  onDelete,
}: {
  debt: Debt;
  onPay: () => void;
  onClear: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard className="!p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-semibold truncate">{debt.name}</p>
            {debt.linkedAccountId && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[#ff9500]/15 text-[#ff9500]">
                <CreditCard className="w-2.5 h-2.5" />
                Card bill
              </span>
            )}
          </div>
          {debt.notes && (
            <p className="text-[10px] text-muted mt-0.5 line-clamp-2">{debt.notes}</p>
          )}
        </div>
        <p className="text-base font-bold text-[#ff3b30] tabular-nums shrink-0">
          {formatCurrency(debt.amount)}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        <GlassButton size="sm" variant="secondary" onClick={onPay}>
          <Landmark className="w-3 h-3" /> Record payment
        </GlassButton>
        <GlassButton size="sm" onClick={onClear}>
          <CheckCircle2 className="w-3 h-3" /> Mark cleared
        </GlassButton>
        <GlassButton size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </GlassButton>
        <GlassButton size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="w-3 h-3 text-[#ff3b30]" />
        </GlassButton>
      </div>
    </GlassCard>
  );
}
