"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { GlassButton } from "@/components/ui/glass-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PersonFilter } from "@/components/ui/person-tabs";
import { TransferSummary } from "@/components/transfers/transfer-summary";
import { RatePanel } from "@/components/transfers/rate-panel";
import { TransferAnalytics } from "@/components/transfers/transfer-analytics";
import { TransferHistory } from "@/components/transfers/transfer-history";
import { TransferEditor } from "@/components/transfers/transfer-editor";
import { useFinanceStore } from "@/store/finance-store";
import { formatCurrency } from "@/lib/formatters";
import { COUNTRY_META, formatReceived, formatTransferDate, type RemittanceDraft } from "@/lib/remittances";
import { zonedToday } from "@/lib/zoned-date";
import type { Remittance } from "@/types";

/**
 * Money Transfers: what was sent from the US to India and the Philippines.
 *
 * The four totals first, because that is the question — then today's rate,
 * the trend, and every transfer. Wider than the other screens on a desktop:
 * a seven-column history and charts beside the rates need the room, and on a
 * phone it collapses to the same single column as the rest of the app.
 *
 * These are records, not ledger entries. Saving one moves no balance and
 * writes no History row, so money already logged as a spend is not counted
 * twice. They sync between the two phones like everything else.
 */

const NONE: Remittance[] = [];

export default function TransfersPage() {
  const stored = useFinanceStore((state) => state.remittances);
  const addRemittance = useFinanceStore((state) => state.addRemittance);
  const updateRemittance = useFinanceStore((state) => state.updateRemittance);
  const deleteRemittance = useFinanceStore((state) => state.deleteRemittance);

  const [personFilter, setPersonFilter] = useState<PersonFilter>("overall");
  /** The form is keyed by each opening, so it always starts from what it was opened on. */
  const [editor, setEditor] = useState<{ open: boolean; editing: Remittance | null; key: number }>({
    open: false,
    editing: null,
    key: 0,
  });
  const [pendingDelete, setPendingDelete] = useState<Remittance | null>(null);

  const all = stored ?? NONE;
  const visible = useMemo(
    () => (personFilter === "overall" ? all : all.filter((transfer) => transfer.person === personFilter)),
    [all, personFilter]
  );
  const today = zonedToday();

  const openEditor = (editing: Remittance | null) =>
    setEditor((current) => ({ open: true, editing, key: current.key + 1 }));
  const closeEditor = () => setEditor((current) => ({ ...current, open: false }));

  const save = (draft: RemittanceDraft) => {
    if (editor.editing) updateRemittance(editor.editing.id, draft);
    else addRemittance(draft);
    closeEditor();
  };

  return (
    <>
      <CompactPageShell
        title="Money Transfers"
        subtitle="What you've sent to India and the Philippines"
        className="lg:max-w-5xl"
        personOverall
        personFilter={personFilter}
        onPersonFilterChange={setPersonFilter}
        action={
          <GlassButton size="sm" onClick={() => openEditor(null)}>
            <Plus className="h-3.5 w-3.5" /> Add transfer
          </GlassButton>
        }
      >
        <TransferSummary transfers={visible} today={today} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
          <RatePanel />
          <TransferAnalytics transfers={visible} today={today} />
        </div>

        <TransferHistory
          transfers={visible}
          onAdd={() => openEditor(null)}
          onEdit={(transfer) => openEditor(transfer)}
          onDelete={setPendingDelete}
        />
      </CompactPageShell>

      <TransferEditor
        key={editor.key}
        open={editor.open}
        onClose={closeEditor}
        editing={editor.editing}
        defaultPerson={personFilter === "overall" ? "kushvanth" : personFilter}
        onSave={save}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this transfer?"
        message={
          pendingDelete
            ? `The ${formatTransferDate(pendingDelete.date)} transfer of ${formatCurrency(pendingDelete.usdAmount)} to ${
                COUNTRY_META[pendingDelete.country].name
              } (${formatReceived(pendingDelete)}) will be removed from both phones. Account balances are not affected.`
            : ""
        }
        confirmLabel="Delete transfer"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteRemittance(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
