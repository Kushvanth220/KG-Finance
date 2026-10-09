"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { resolveEntry } from "@/lib/rules/engine";
import { toIsoDate } from "@/lib/ai/reminders";
import { zonedClockNow } from "@/lib/zoned-date";
import { roundMoney } from "@/lib/money";
import type { Rule, RuleEntry, RuleField } from "@/lib/rules/types";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Record occurrences under a rule, or answer the question it came back to ask
 * later.
 *
 * A repeatable rule takes SEVERAL at once. Three Flex blocks in a day is one
 * sitting at the phone, not three; making it three trips through a dialog
 * turned a two-minute job into a chore, so the rows stack in one form and the
 * day is typed once.
 *
 * The running total is shown as it is typed, because the whole point of the
 * Flex rule is that the deposit is base plus tips — seeing it land is the
 * confirmation that the rule was written correctly.
 */

interface Row {
  id: string;
  values: Record<string, string>;
}

/** Times and dates are short enough to sit two to a line; money is not. */
function isNarrow(field: RuleField): boolean {
  return field.type === "time" || field.type === "date" || field.type === "number";
}

export interface EntryPreset {
  label: string;
  /** Field key → value, as typed. */
  values: Record<string, string>;
}

export function RuleEntryEditor({
  open,
  rule,
  entry,
  mode,
  initialValues,
  initialDate,
  presets = [],
  onSave,
  onClose,
}: {
  open: boolean;
  rule: Rule;
  entry?: RuleEntry;
  /** "start" opens a new entry; "follow_up" fills in what was pending; "edit" reopens everything. */
  mode: "start" | "follow_up" | "edit";
  /** Fields already known when a new entry opens — a timer that just stopped, say. */
  initialValues?: Record<string, string>;
  initialDate?: string;
  /** One-tap fills offered above a new entry ("Same as last block"). */
  presets?: EntryPreset[];
  /** Called once per row, so several occurrences save as several entries. */
  onSave: (values: Record<string, string | number>, date?: string) => void;
  onClose: () => void;
}) {
  const asked = rule.fields.filter((item) =>
    mode === "edit" ? true : mode === "start" ? item.askAt === "start" : item.askAt === "follow_up"
  );

  // Only a repeatable rule can happen more than once on the same day.
  const stackable = mode === "start" && rule.repeatable === true;

  const counter = useRef(1);
  const [rows, setRows] = useState<Row[]>(() => {
    const seed: Record<string, string> = {};
    for (const item of asked) {
      const existing = entry?.values[item.key] ?? initialValues?.[item.key];
      seed[item.key] = existing === undefined ? "" : String(existing);
    }
    return [{ id: "row-0", values: seed }];
  });
  const [date, setDate] = useState(entry?.date ?? initialDate ?? toIsoDate(new Date()));

  /** Fills the first row from a preset; other rows are left alone. */
  const applyPreset = (preset: EntryPreset) =>
    setRows((current) =>
      current.map((row, index) =>
        index === 0 ? { ...row, values: { ...row.values, ...preset.values } } : row
      )
    );

  const setField = (rowId: string, key: string, value: string) =>
    setRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
      )
    );

  const addRow = () =>
    setRows((current) => [...current, { id: `row-${counter.current++}`, values: {} }]);

  const removeRow = (rowId: string) =>
    setRows((current) => (current.length === 1 ? current : current.filter((r) => r.id !== rowId)));

  const typedOf = (row: Row): Record<string, string | number> => {
    const typed: Record<string, string | number> = {};
    for (const [key, raw] of Object.entries(row.values)) {
      if (raw === "") continue;
      const item = rule.fields.find((f) => f.key === key);
      typed[key] = item && (item.type === "money" || item.type === "number") ? Number(raw) : raw;
    }
    return typed;
  };

  const previewOf = (row: Row) =>
    resolveEntry(rule, {
      id: entry?.id ?? "preview",
      ruleId: rule.id,
      date,
      openedAt: entry?.openedAt ?? new Date().toISOString(),
      values: { ...(entry?.values ?? {}), ...typedOf(row) },
      answered: entry?.answered ?? [],
      complete: false,
    });

  // A row left completely blank is someone who changed their mind, not an error.
  const started = (row: Row) => Object.values(row.values).some((value) => value.trim() !== "");
  const ready = (row: Row) => asked.every((item) => !item.required || row.values[item.key]?.trim());

  const live = rows.filter((row) => (rows.length === 1 ? true : started(row)));
  const canSave = live.length > 0 && live.every(ready);

  // The one figure worth totalling across rows is whatever the rule pays out.
  const totalKey =
    rule.payout?.amountKey ?? rule.calculations.find((item) => item.money)?.key ?? null;
  const combined = totalKey
    ? roundMoney(live.reduce((sum, row) => sum + Number(previewOf(row)[totalKey] ?? 0), 0))
    : 0;

  const save = () => {
    if (!canSave) return;
    for (const row of live) onSave(typedOf(row), mode === "follow_up" ? undefined : date);
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={
        mode === "edit"
          ? "Edit block"
          : mode === "start"
            ? `Log · ${rule.name}`
            : rule.followUps[0]?.question || "Fill in"
      }
    >
      <div className="space-y-3">
        {mode === "start" || mode === "edit" ? (
          <div>
            <label className="text-[11px] font-medium text-muted">Which day?</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
            {stackable ? (
              <p className="mt-1 text-[10px] text-muted">Everything below is logged on this day.</p>
            ) : null}
          </div>
        ) : null}

        {mode === "start" && presets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="hit rounded-full glass px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}

        {rows.map((row, index) => {
          const preview = previewOf(row);

          return (
            <div
              key={row.id}
              className={cn(
                stackable && "rounded-2xl border border-black/10 p-3 dark:border-white/15"
              )}
            >
              {stackable ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    #{index + 1}
                  </p>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove number ${index + 1}`}
                      className="hit rounded-lg p-1 text-muted hover:bg-black/5 hover:text-negative dark:hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                {asked.map((item) => (
                  <div key={item.key} className={cn(!isNarrow(item) && "col-span-2")}>
                    <label className="flex items-center justify-between text-[11px] font-medium text-muted">
                      {/* Stacked rows would ask the same long question over and over. */}
                      <span>{stackable || mode === "edit" ? item.label : item.question || item.label}</span>
                      {item.type === "time" ? (
                        <button
                          type="button"
                          onClick={() => setField(row.id, item.key, zonedClockNow())}
                          className="hit rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Now
                        </button>
                      ) : null}
                    </label>
                    <input
                      value={row.values[item.key] ?? ""}
                      onChange={(event) => setField(row.id, item.key, event.target.value)}
                      inputMode={item.type === "money" || item.type === "number" ? "decimal" : "text"}
                      type={item.type === "date" ? "date" : item.type === "time" ? "time" : "text"}
                      placeholder={item.type === "money" ? "0.00" : item.label}
                      // The cursor lands on the first blank, so prefilled times are skipped.
                      autoFocus={index === 0 && item === (asked.find((f) => !rows[0]?.values[f.key]) ?? asked[0])}
                      className="mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                ))}
              </div>

              {rule.calculations.length > 0 ? (
                <div
                  className={cn(
                    "mt-2 rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2",
                    stackable && !started(row) && "opacity-40"
                  )}
                >
                  {rule.calculations.map((calculation) => (
                    <p key={calculation.key} className="flex justify-between text-[12px]">
                      <span>{calculation.label}</span>
                      <span className="font-semibold tabular-nums">
                        {calculation.money
                          ? formatCurrency(Number(preview[calculation.key] ?? 0))
                          : String(preview[calculation.key] ?? 0)}
                      </span>
                    </p>
                  ))}
                  {!stackable && mode === "start" && rule.followUps.length > 0 ? (
                    <p className="mt-1 text-[10px] text-muted">
                      {rule.followUps[0]!.question} — in {rule.followUps[0]!.afterHours}h
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {stackable ? (
          <>
            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/15 py-2.5 text-[12px] font-semibold text-accent hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04]"
            >
              <Plus className="h-3.5 w-3.5" /> Add another
            </button>

            {live.length > 1 && totalKey ? (
              <div className="flex items-center justify-between rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
                <span className="text-[12px] font-medium">
                  {live.length} to log{rule.followUps.length > 0 ? ", tips asked later" : ""}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {formatCurrency(combined)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex gap-2">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" onClick={save} disabled={!canSave}>
            {stackable && live.length > 1 ? `Save ${live.length}` : "Save"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
