"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Trash2 } from "lucide-react";
import { ActiveTransactionDetails } from "@/components/history/active-transaction-details";
import { accountLabel } from "@/lib/accounts";
import { formatAmount } from "@/lib/formatters";
import type { BalanceAfter } from "@/lib/running-balance";
import type { Account, Transaction } from "@/types";
import { cn } from "@/lib/utils";

/**
 * One History row: what it was, who and where, how much, and what was left.
 * On a phone, swipe it left for Delete; on a computer the bin sits at the end.
 * The full auto-written sentence and every field are under Details.
 */

// How far the row slides to show Delete.
const OPEN = 84;

export function HistoryRow({
  transaction,
  icon,
  title,
  meta,
  amount,
  amountTone,
  left,
  accounts,
  onDelete,
}: {
  transaction: Transaction;
  icon: string;
  title: string;
  /** "Kushvanth · Green Dot · 10:15 AM" */
  meta: string;
  /** "-$19.67", "+$84.20", "$50.00" for a move. */
  amount: string;
  amountTone?: string;
  left?: BalanceAfter[];
  accounts: Map<string, Account>;
  onDelete: () => void;
}) {
  const [shift, setShift] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Where the finger went down, and whether this touch is a sideways swipe (true), a scroll (false) or undecided.
  const drag = useRef<{ x: number; y: number; from: number; sideways: boolean | null } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    drag.current = { x: event.clientX, y: event.clientY, from: shift, sideways: null };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (d.sideways === null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.sideways = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > 8) {
        d.sideways = false;
      }
    }
    if (d.sideways) setShift(Math.max(-OPEN, Math.min(0, d.from + dx)));
  };
  const onPointerEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.sideways) return;
    setDragging(false);
    setShift((now) => (now < -OPEN / 2 ? -OPEN : 0));
  };

  const shown = (left ?? []).slice(0, 2);

  return (
    <div className="relative overflow-hidden">
      {/* Only as wide as the gap the row leaves, so it never shows through the glass. */}
      <button
        type="button"
        onClick={() => {
          setShift(0);
          onDelete();
        }}
        tabIndex={shift === 0 ? -1 : 0}
        aria-hidden={shift === 0}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-negative text-[12px] font-semibold text-white md:hidden"
        style={{ width: -shift, transition: dragging ? "none" : "width 260ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {-shift > 40 ? "Delete" : null}
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          // A tap on an open row closes it rather than opening Details.
          if (shift !== 0) {
            event.stopPropagation();
            event.preventDefault();
            setShift(0);
          }
        }}
        className="grid touch-pan-y grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-2.5"
        style={{
          transform: shift ? `translateX(${shift}px)` : undefined,
          transition: dragging ? "none" : "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-black/[0.04] text-[15px] leading-none dark:bg-white/[0.07]" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-snug">{title}</p>
          <p className="truncate text-[11px] text-muted">{meta}</p>
          <ActiveTransactionDetails transaction={transaction} />
        </div>
        <div className="flex items-start gap-1">
          <div className="text-right">
            <p className={cn("whitespace-nowrap text-[13px] font-semibold tabular-nums", amountTone)}>{amount}</p>
            {shown.map(({ accountId, balance }) => {
              const account = accounts.get(accountId);
              if (!account) return null;
              const credit = account.type === "credit";
              const bad = credit ? balance > 0 : balance < 0;
              return (
                <p key={accountId} className="max-w-[150px] truncate text-[10px] tabular-nums text-muted">
                  {shown.length > 1 ? `${accountLabel(account)} ` : ""}
                  <span className={cn(bad && "text-negative")}>{formatAmount(balance)}</span> {credit ? "owed" : "left"}
                </p>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="hidden rounded-lg p-1.5 text-muted hover:bg-negative/10 hover:text-negative md:inline-flex"
            aria-label="Delete transaction"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
