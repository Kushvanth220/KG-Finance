"use client";

import { useEffect, useRef } from "react";

/**
 * The tab bar's quick actions (press and hold Spend): each goes to a page and
 * opens something on it. The request waits here until that page is showing,
 * so it works whether the page is already open or still on its way.
 */

export type QuickAction = "income" | "transfer" | "calculator";

let pending: QuickAction | null = null;
const listeners = new Set<(action: QuickAction) => void>();

/** Ask for an action; the page that handles it picks it up when it shows. */
export function requestQuickAction(action: QuickAction) {
  pending = action;
  listeners.forEach((listener) => listener(action));
}

/** On the page that handles `action`: run `handler` when it is asked for. */
export function useQuickAction(action: QuickAction, handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(() => {
    const run = (asked: QuickAction) => {
      if (asked !== action) return;
      pending = null;
      latest.current();
    };
    if (pending === action) run(action);
    listeners.add(run);
    return () => {
      listeners.delete(run);
    };
  }, [action]);
}
