"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Pencil, Search, Trash2, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { CountryFlag } from "@/components/transfers/country-flag";
import { formatCurrency } from "@/lib/formatters";
import { listRow, transition } from "@/lib/motion-presets";
import {
  COUNTRIES,
  COUNTRY_META,
  filterRemittances,
  formatForeign,
  formatRate,
  formatReceived,
  formatTransferDate,
  methodLabel,
  noteText,
  remittanceTotals,
} from "@/lib/remittances";
import type { Remittance, RemittanceCountry } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Every transfer, newest first, with the totals of whatever is showing.
 *
 * A real table where there is room for one; on a phone each transfer is two
 * lines — where and when, then how much each side — because seven columns at
 * 390px is a table nobody can read. The totals follow the filters, and keep
 * dollars, fees, rupees and pesos as four separate figures.
 */

const FOLD = 10;

export function TransferHistory({
  transfers,
  onAdd,
  onEdit,
  onDelete,
}: {
  transfers: Remittance[];
  onAdd: () => void;
  onEdit: (transfer: Remittance) => void;
  onDelete: (transfer: Remittance) => void;
}) {
  const still = useReducedMotion();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<RemittanceCountry | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => filterRemittances(transfers, { person: "overall", country, from: from || undefined, to: to || undefined, query }),
    [transfers, country, from, to, query]
  );
  const totals = useMemo(() => remittanceTotals(filtered), [filtered]);
  const filtering = query.trim() !== "" || country !== "all" || from !== "" || to !== "";
  const shown = showAll ? filtered : filtered.slice(0, FOLD);

  const clear = () => {
    setQuery("");
    setCountry("all");
    setFrom("");
    setTo("");
  };

  return (
    <GlassCard className="!p-0 overflow-hidden" flat>
      <div className="space-y-2.5 border-b border-black/5 p-3 dark:border-white/10 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">
            History <span className="font-normal text-muted">· {transfers.length}</span>
          </p>
          {filtering ? (
            <button type="button" onClick={clear} className="hit inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent">
              <X className="h-3 w-3" /> Clear filters
            </button>
          ) : null}
        </div>

        <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes, dates or services — e.g. medical, Oct 5, Wise"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
            aria-label="Search transfers"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="glass flex gap-0.5 rounded-lg p-0.5" role="group" aria-label="Country">
            {(["all", ...COUNTRIES] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={country === code}
                onClick={() => setCountry(code)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold sm:flex-none",
                  country === code ? "text-white" : "text-muted hover:text-foreground"
                )}
                style={country === code ? { background: code === "all" ? "var(--accent)" : COUNTRY_META[code].color } : undefined}
              >
                {code !== "all" ? <CountryFlag country={code} className="h-2.5 w-[15px]" /> : null}
                {code === "all" ? "All" : COUNTRY_META[code].name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:items-center">
            <label className="glass flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted">
              From
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
            </label>
            <label className="glass flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted">
              To
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
            </label>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={filtering ? "Totals for these filters" : "Totals"}>
            {[
              { label: `Sent · ${totals.count}`, value: formatCurrency(totals.usdSent) },
              { label: "Fees", value: formatCurrency(totals.fees) },
              { label: "₹ received", value: formatForeign(totals.byCountry.IN.received, "INR") },
              { label: "₱ received", value: formatForeign(totals.byCountry.PH.received, "PHP") },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-wide text-muted">{tile.label}</p>
                <p className="truncate text-[13px] font-semibold tabular-nums">{tile.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {transfers.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] font-medium">No transfers recorded yet</p>
          <p className="mt-1 text-[11px] text-muted">Each one you add shows here, newest first.</p>
          <button type="button" onClick={onAdd} className="hit mt-3 text-[12px] font-semibold text-accent">
            Add your first transfer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] font-medium">No transfers match these filters</p>
          <button type="button" onClick={clear} className="hit mt-2 text-[12px] font-semibold text-accent">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* Phone: two lines a transfer. */}
          <ul className="divide-y divide-black/5 dark:divide-white/10 md:hidden">
            <AnimatePresence initial={false}>
              {shown.map((transfer) => (
                <motion.li
                  key={transfer.id}
                  layout={still ? false : "position"}
                  variants={still ? undefined : listRow}
                  initial={still ? false : "hidden"}
                  animate={still ? undefined : "shown"}
                  exit={still ? undefined : "gone"}
                  transition={transition}
                  className="flex items-start gap-3 overflow-hidden px-3 py-2.5"
                >
                  <CountryFlag country={transfer.country} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-medium">{noteText(transfer)}</p>
                      <p className="shrink-0 text-[13px] font-semibold tabular-nums">{formatCurrency(transfer.usdAmount)}</p>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted">
                      <p className="truncate">
                        {formatTransferDate(transfer.date)} · {methodLabel(transfer)} · {formatRate(transfer.rate)}
                      </p>
                      <p className="shrink-0 tabular-nums">{formatReceived(transfer)}</p>
                    </div>
                    {transfer.feeUsd ? (
                      <p className="mt-0.5 text-[10px] text-muted tabular-nums">+ {formatCurrency(transfer.feeUsd)} fee</p>
                    ) : null}
                  </div>
                  <RowActions transfer={transfer} onEdit={onEdit} onDelete={onDelete} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {/* Wider screens: the table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-black/5 text-[10px] uppercase tracking-wide text-muted dark:border-white/10">
                  <th scope="col" className="px-4 py-2 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Country</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">USD sent</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Received</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Rate</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Method</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Note</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {shown.map((transfer) => (
                    <motion.tr
                      key={transfer.id}
                      initial={still ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={still ? undefined : { opacity: 0 }}
                      transition={transition}
                      className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formatTransferDate(transfer.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <CountryFlag country={transfer.country} className="h-3 w-[18px]" />
                          {COUNTRY_META[transfer.country].name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold">{formatCurrency(transfer.usdAmount)}</span>
                        {transfer.feeUsd ? (
                          <span className="block text-[10px] text-muted">+ {formatCurrency(transfer.feeUsd)} fee</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{formatReceived(transfer)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted">{formatRate(transfer.rate)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{methodLabel(transfer)}</td>
                      <td className="max-w-[220px] truncate px-3 py-2.5" title={noteText(transfer)}>{noteText(transfer)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <RowActions transfer={transfer} onEdit={onEdit} onDelete={onDelete} />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {filtered.length > FOLD ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
              className="hit flex w-full items-center justify-center gap-1 border-t border-black/5 py-2.5 text-[11px] font-semibold text-accent dark:border-white/10"
            >
              {showAll ? "Show fewer" : `Show all ${filtered.length}`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
            </button>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}

function RowActions({
  transfer,
  onEdit,
  onDelete,
}: {
  transfer: Remittance;
  onEdit: (transfer: Remittance) => void;
  onDelete: (transfer: Remittance) => void;
}) {
  const what = `${formatCurrency(transfer.usdAmount)} to ${COUNTRY_META[transfer.country].name} on ${formatTransferDate(transfer.date)}`;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <button type="button" onClick={() => onEdit(transfer)} aria-label={`Edit ${what}`} className="tap-icon focus-ring rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5">
        <Pencil className="h-3.5 w-3.5 text-muted" />
      </button>
      <button type="button" onClick={() => onDelete(transfer)} aria-label={`Delete ${what}`} className="tap-icon focus-ring rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5">
        <Trash2 className="h-3.5 w-3.5 text-negative" />
      </button>
    </span>
  );
}
