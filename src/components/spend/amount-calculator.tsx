"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Delete, History } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import {
  addToHistory,
  calculate,
  formatCalculation,
  isCalculation,
  parseHistory,
  toAmountText,
  type CalculationRecord,
} from "@/lib/calculator";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * A full calculator for the amount, with the sums worked out before.
 *
 * Opens on whatever the amount already says, so "12.5+3.2" typed in the field
 * carries on here. "=" works the sum out and keeps it in the history; "Use"
 * puts the answer into the amount. The history stays on this device: it is
 * scratch paper, not a record of money.
 */

const STORAGE_KEY = "kg-calc-history";
// The history shows this many until asked for all of it.
const SHOWN_ROWS = 7;

const listeners = new Set<() => void>();
// Where the history lives when storage is blocked (a private window): it lasts the visit.
let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cached: CalculationRecord[] = [];

function readHistory(): CalculationRecord[] {
  let raw = memoryRaw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? memoryRaw;
  } catch {
    // Blocked storage: the in-memory copy stands in.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseHistory(raw);
  }
  return cached;
}

function writeHistory(history: CalculationRecord[]) {
  memoryRaw = JSON.stringify(history);
  try {
    window.localStorage.setItem(STORAGE_KEY, memoryRaw);
  } catch {
    // Not being able to keep the history is not a reason to refuse the sum.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const noHistory: CalculationRecord[] = [];

function useCalculationHistory() {
  return useSyncExternalStore(subscribe, readHistory, () => noHistory);
}

function remember(expression: string, result: number) {
  writeHistory(
    addToHistory(readHistory(), {
      id: uuidv4(),
      expression,
      result,
      at: new Date().toISOString(),
    })
  );
}

const OPERATORS = ["+", "−", "×", "÷"];
const isOperator = (ch: string | undefined) => !!ch && OPERATORS.includes(ch);
const isDigit = (ch: string | undefined) => !!ch && /\d/.test(ch);

/** The amount field's text in the calculator's own symbols. */
const fromField = (text: string) =>
  text.replace(/[$,\s]/g, "").replace(/\*/g, "×").replace(/[x]/g, "×").replace(/\//g, "÷").replace(/-/g, "−");

/** A result as digits the keypad can carry on from: no grouping, no float noise. */
const plain = (value: number) => String(Math.round(value * 1e8) / 1e8).replace(/-/g, "−");

type Key =
  | { kind: "digit"; value: string }
  | { kind: "dot" }
  | { kind: "op"; value: string }
  | { kind: "percent" }
  | { kind: "brackets" }
  | { kind: "back" }
  | { kind: "clear" }
  | { kind: "equals" };

/** What a key does to the sum being typed. `fresh` is a result just shown by "=". */
function press(expression: string, fresh: boolean, key: Key): string {
  const last = expression[expression.length - 1];
  switch (key.kind) {
    case "digit":
      if (fresh) return key.value;
      if (last === ")" || last === "%") return `${expression}×${key.value}`;
      return expression + key.value;
    case "dot": {
      if (fresh) return "0.";
      const number = expression.match(/[\d.]*$/)?.[0] ?? "";
      if (number.includes(".")) return expression;
      if (last === ")" || last === "%") return `${expression}×0.`;
      return expression + (number ? "." : "0.");
    }
    case "op":
      if (!expression) return key.value === "−" ? "−" : expression;
      // A minus straight after another operator or a bracket is a sign: 4×−2.
      if (key.value === "−" && (last === "×" || last === "÷" || last === "(")) return expression + key.value;
      if (isOperator(last)) {
        const trimmed = expression.slice(0, -1);
        // "4×−" then "+" replaces both.
        const base = isOperator(trimmed[trimmed.length - 1]) ? trimmed.slice(0, -1) : trimmed;
        return base ? base + key.value : expression;
      }
      if (last === "(" || last === ".") return expression;
      return expression + key.value;
    case "percent":
      return isDigit(last) || last === ")" ? `${expression}%` : expression;
    case "brackets": {
      const open = (expression.match(/\(/g) ?? []).length - (expression.match(/\)/g) ?? []).length;
      if (open > 0 && (isDigit(last) || last === ")" || last === "%")) return `${expression})`;
      if (fresh || !expression) return "(";
      if (isDigit(last) || last === ")" || last === "%") return `${expression}×(`;
      return `${expression}(`;
    }
    case "back":
      return expression.slice(0, -1);
    case "clear":
      return "";
    case "equals":
      return expression;
  }
}

const KEYS: { label: string; key: Key; tone?: "op" | "clear" | "equals"; aria?: string }[][] = [
  [
    { label: "C", key: { kind: "clear" }, tone: "clear", aria: "Clear" },
    { label: "( )", key: { kind: "brackets" }, tone: "op", aria: "Brackets" },
    { label: "%", key: { kind: "percent" }, tone: "op", aria: "Percent" },
    { label: "÷", key: { kind: "op", value: "÷" }, tone: "op", aria: "Divide" },
  ],
  [
    { label: "7", key: { kind: "digit", value: "7" } },
    { label: "8", key: { kind: "digit", value: "8" } },
    { label: "9", key: { kind: "digit", value: "9" } },
    { label: "×", key: { kind: "op", value: "×" }, tone: "op", aria: "Multiply" },
  ],
  [
    { label: "4", key: { kind: "digit", value: "4" } },
    { label: "5", key: { kind: "digit", value: "5" } },
    { label: "6", key: { kind: "digit", value: "6" } },
    { label: "−", key: { kind: "op", value: "−" }, tone: "op", aria: "Minus" },
  ],
  [
    { label: "1", key: { kind: "digit", value: "1" } },
    { label: "2", key: { kind: "digit", value: "2" } },
    { label: "3", key: { kind: "digit", value: "3" } },
    { label: "+", key: { kind: "op", value: "+" }, tone: "op", aria: "Plus" },
  ],
  [
    { label: "⌫", key: { kind: "back" }, aria: "Delete the last character" },
    { label: "0", key: { kind: "digit", value: "0" } },
    { label: ".", key: { kind: "dot" }, aria: "Decimal point" },
    { label: "=", key: { kind: "equals" }, tone: "equals", aria: "Equals" },
  ],
];

/** The typed keys a keyboard can send. */
function keyFromKeyboard(event: KeyboardEvent): Key | null {
  const k = event.key;
  if (/^\d$/.test(k)) return { kind: "digit", value: k };
  if (k === ".") return { kind: "dot" };
  if (k === "+") return { kind: "op", value: "+" };
  if (k === "-") return { kind: "op", value: "−" };
  if (k === "*" || k === "x") return { kind: "op", value: "×" };
  if (k === "/") return { kind: "op", value: "÷" };
  if (k === "%") return { kind: "percent" };
  if (k === "(" || k === ")") return { kind: "brackets" };
  if (k === "Enter" || k === "=") return { kind: "equals" };
  if (k === "Backspace") return { kind: "back" };
  if (k === "Delete" || k === "c" || k === "C") return { kind: "clear" };
  return null;
}

export function AmountCalculator({
  open,
  onClose,
  initial,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  /** The amount field's text when the calculator opened. */
  initial: string;
  /** Puts an answer into the amount field. */
  onUse: (amountText: string) => void;
}) {
  // Mounted fresh on each open (see the Spend page), so the sum starts from the field.
  const [expression, setExpression] = useState(() => fromField(initial));
  // The sum "=" just worked out, shown above the answer until the next key.
  const [worked, setWorked] = useState<string | null>(null);
  const [view, setView] = useState<"keypad" | "history">("keypad");
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const history = useCalculationHistory();

  const value = calculate(expression);
  const usable = value !== null && Math.round(value * 100) > 0;

  const apply = (key: Key) => {
    if (key.kind === "equals") {
      if (value === null || !isCalculation(expression)) return;
      remember(expression, value);
      setWorked(expression);
      setExpression(plain(value));
      return;
    }
    setExpression((current) => press(current, worked !== null, key));
    setWorked(null);
  };

  const use = (result: number, sum?: string) => {
    if (sum && isCalculation(sum)) remember(sum, result);
    onUse(toAmountText(result));
    onClose();
  };

  // A keyboard types into the keypad while it is open.
  useEffect(() => {
    if (!open || view !== "keypad") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = keyFromKeyboard(event);
      if (!key) return;
      event.preventDefault();
      apply(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const rows = showAll ? history : history.slice(0, SHOWN_ROWS);

  return (
    <GlassModal open={open} onClose={onClose} title="Calculator">
      <div className="space-y-3">
        <div className="glass flex gap-0.5 rounded-lg p-0.5" role="tablist" aria-label="Calculator or history">
          {(["keypad", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => setView(tab)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                view === tab ? "bg-accent text-white shadow-sm" : "text-muted"
              )}
            >
              {tab === "keypad" ? (
                "Keypad"
              ) : (
                <>
                  <History className="h-3 w-3" aria-hidden /> History{history.length ? ` · ${history.length}` : ""}
                </>
              )}
            </button>
          ))}
        </div>

        {view === "keypad" ? (
          <>
            <div className="rounded-xl bg-black/[0.03] px-3 py-2.5 text-right dark:bg-white/[0.04]" aria-live="polite">
              <p className="overflow-x-auto whitespace-nowrap text-[13px] text-muted tabular-nums [scrollbar-width:none]">
                {worked ? `${worked} =` : expression || " "}
              </p>
              <p
                className={cn(
                  "overflow-x-auto whitespace-nowrap text-3xl font-semibold tabular-nums [scrollbar-width:none]",
                  value === null && expression ? "text-muted" : ""
                )}
              >
                {value === null ? (expression ? "…" : "0") : formatCalculation(value)}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {KEYS.flat().map(({ label, key, tone, aria }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => apply(key)}
                  aria-label={aria ?? label}
                  className={cn(
                    "btn-press flex h-12 items-center justify-center rounded-xl text-lg font-medium tabular-nums transition-colors",
                    tone === "equals"
                      ? "bg-accent text-white"
                      : tone === "op"
                        ? "bg-accent/10 text-accent"
                        : tone === "clear"
                          ? "bg-negative/10 text-negative"
                          : "bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                  )}
                >
                  {key.kind === "back" ? <Delete className="h-4 w-4" aria-hidden /> : label}
                </button>
              ))}
            </div>

            <GlassButton
              className="w-full"
              disabled={!usable}
              onClick={() => value !== null && use(value, worked ?? expression)}
            >
              {usable ? `Use ${formatCurrency(Math.round(value * 100) / 100)}` : "Work out an amount to use"}
            </GlassButton>
          </>
        ) : history.length === 0 ? (
          <p className="rounded-xl bg-black/[0.03] px-3 py-6 text-center text-[12px] text-muted dark:bg-white/[0.04]">
            No sums yet. Work one out on the keypad and press = — it&apos;s kept here.
          </p>
        ) : (
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {rows.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpression(item.expression);
                      setWorked(null);
                      setView("keypad");
                    }}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open ${item.expression} on the keypad`}
                  >
                    <p className="truncate text-[11px] text-muted tabular-nums">{item.expression} =</p>
                    <p className="truncate text-[13px] font-semibold tabular-nums">{formatCalculation(item.result)}</p>
                    <p className="text-[10px] text-muted">{formatDateTime("", undefined, item.at)}</p>
                  </button>
                  <button
                    type="button"
                    disabled={Math.round(item.result * 100) <= 0}
                    onClick={() => use(item.result)}
                    className="shrink-0 rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent disabled:opacity-40"
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-1">
              {history.length > SHOWN_ROWS ? (
                <button
                  type="button"
                  onClick={() => setShowAll((all) => !all)}
                  className="text-[11px] font-semibold text-accent"
                >
                  {showAll ? "Show fewer" : `Show all ${history.length}`}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    return;
                  }
                  writeHistory([]);
                  setConfirmClear(false);
                }}
                className={cn("text-[11px] font-semibold", confirmClear ? "text-negative" : "text-muted")}
              >
                {confirmClear ? `Clear all ${history.length}? Tap again` : "Clear history"}
              </button>
            </div>
          </div>
        )}
      </div>
    </GlassModal>
  );
}
