"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, Calculator, Check, LayoutGrid, Loader2, Mic, Pencil, Plus, Wallet, X } from "lucide-react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import {
  getLastSyncError,
  onSyncStatusChange,
  type SyncStatus,
} from "@/lib/supabase/sync";
import {
  BAR_SLOTS,
  barChoices,
  isNavActive,
  moreNavItems,
  resolveBar,
} from "@/components/layout/nav-config";
import { saveNav, useSharedNav } from "@/components/dashboard/home-cards-editor";
import { useAssistant } from "@/components/assistant/assistant-context";
import { ASSISTANT_MIC_READY_EVENT } from "@/lib/ai/assistant-wake";
import { ensureAudioUnlocked } from "@/lib/ai/audio-utils";
import { requestQuickAction, type QuickAction } from "@/lib/quick-actions";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The phone's tab bar: three pages you choose either side of Spend, and More
 * for the rest. Which three is saved with the Home layout, so both phones
 * match. Press and hold Spend for the quick actions.
 */

// How long a press on Spend must last to open the quick actions instead.
const HOLD_MS = 420;

// Two rows above Spend, wide enough apart that the longest label never touches its neighbour.
const QUICK = [
  { key: "income", label: "Income", icon: Plus, x: -76, y: -30 },
  { key: "ask", label: "Ask", icon: Mic, x: 76, y: -30 },
  { key: "transfer", label: "Self transfer", icon: ArrowLeftRight, x: -76, y: -78 },
  { key: "calculator", label: "Calculator", icon: Calculator, x: 76, y: -78 },
] as const;

const tintFor = (href: string) => moreNavItems.find((item) => item.href === href)?.tint ?? "var(--accent)";

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const still = useReducedMotion();
  const { openAssistant } = useAssistant();
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === pathname;
  const setMoreOpen = (next: boolean) => setMoreOpenAt(next ? pathname : null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [syncConfigured, setSyncConfigured] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  // While editing the bar: the pages picked so far, in order.
  const [editing, setEditing] = useState<string[] | null>(null);

  const bar = resolveBar(useSharedNav());
  const barHrefs = bar.map((choice) => choice.href);
  const rest = barChoices.filter((choice) => !barHrefs.includes(choice.href) && choice.href !== "/sync");

  const holdTimer = useRef(0);
  const held = useRef(false);

  useEffect(() => {
    void isSupabaseConfiguredAsync().then(setSyncConfigured);
    const unsubscribe = onSyncStatusChange((next, nextError) => {
      setSyncStatus(next);
      setSyncError(nextError ?? getLastSyncError());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!quickOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickOpen]);

  const moreActive = rest.some((choice) => isNavActive(pathname, choice.href)) || pathname === "/sync";
  const syncLink = moreNavItems.find((item) => item.href === "/sync");
  const spendActive = isNavActive(pathname, "/spend");

  const runQuick = (key: (typeof QUICK)[number]["key"]) => {
    setQuickOpen(false);
    if (key === "ask") {
      void ensureAudioUnlocked().finally(() => {
        window.dispatchEvent(new Event(ASSISTANT_MIC_READY_EVENT));
        openAssistant({ autoStartVoice: true });
      });
      return;
    }
    const target: Record<QuickAction, string> = { income: "/", transfer: "/accounts", calculator: "/spend" };
    requestQuickAction(key);
    if (!isNavActive(pathname, target[key])) router.push(target[key]);
  };

  const togglePick = (href: string) => {
    setEditing((picked) => {
      const now = picked ?? [];
      if (now.includes(href)) return now.filter((h) => h !== href);
      // A fourth pick takes the third place.
      return now.length >= BAR_SLOTS ? [...now.slice(0, BAR_SLOTS - 1), href] : [...now, href];
    });
  };

  const slot = (choice: (typeof bar)[number]) => {
    const Icon = choice.icon;
    const active = isNavActive(pathname, choice.href);
    return (
      <Link key={choice.href} href={choice.href} className="flex flex-col items-center gap-1 py-1.5">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-2xl transition-all",
            active ? "bg-accent/15 text-accent scale-105" : "text-muted"
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
        </span>
        <span className={cn("text-[10px] font-medium", active ? "text-accent font-semibold" : "text-muted")}>
          {choice.label}
        </span>
      </Link>
    );
  };

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] animate-fade-in-up"
          onClick={() => {
            setMoreOpen(false);
            setEditing(null);
          }}
        />
      )}

      {moreOpen && (
        <div className="md:hidden fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 animate-scale-in">
          <div className="glass-strong rounded-[28px] p-4 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <p className="font-semibold">{editing ? "Edit the tab bar" : "More"}</p>
                <p className="text-xs text-muted">
                  {editing ? `Pick ${BAR_SLOTS} pages, in the order you want them` : "Every other page"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setEditing(null);
                }}
                className="w-9 h-9 rounded-full glass flex items-center justify-center text-muted"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editing ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {barChoices.map((choice) => {
                    const Icon = choice.icon;
                    const place = editing.indexOf(choice.href);
                    return (
                      <button
                        key={choice.href}
                        type="button"
                        onClick={() => togglePick(choice.href)}
                        aria-pressed={place >= 0}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors",
                          place >= 0 ? "bg-accent/12 ring-1 ring-accent/40" : "glass"
                        )}
                      >
                        {place >= 0 ? (
                          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">
                            {place + 1}
                          </span>
                        ) : null}
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-accent">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[10px] font-medium leading-tight">{choice.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setEditing(null)} className="px-2 text-xs font-semibold text-muted">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={editing.length !== BAR_SLOTS}
                    onClick={() => {
                      saveNav(editing);
                      setEditing(null);
                      setMoreOpen(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {editing.length === BAR_SLOTS ? "Save the bar" : `Pick ${BAR_SLOTS - editing.length} more`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {syncLink && (
                  <Link
                    href={syncLink.href}
                    className="mb-4 flex items-center gap-3 rounded-2xl px-3 py-3 glass border border-white/10"
                  >
                    <span
                      className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center",
                        syncStatus === "error"
                          ? "bg-negative/15 text-negative"
                          : syncStatus === "syncing"
                            ? "bg-accent/15 text-accent"
                            : syncConfigured
                              ? "bg-positive/15 text-positive"
                              : "bg-caution/15 text-caution"
                      )}
                    >
                      {syncStatus === "syncing" ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <syncLink.icon className="w-5 h-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {syncConfigured === false ? "Set up cloud sync" : "Cloud sync"}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {syncConfigured === false
                          ? "Add Supabase keys on Vercel"
                          : syncStatus === "error"
                            ? (syncError ?? "Needs a look")
                            : "Both phones, side by side"}
                      </p>
                    </div>
                  </Link>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {rest.map((choice) => {
                    const Icon = choice.icon;
                    const active = isNavActive(pathname, choice.href);
                    const tint = tintFor(choice.href);
                    return (
                      <Link
                        key={choice.href}
                        href={choice.href}
                        className={cn(
                          "tap-card focus-ring flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center",
                          active ? "bg-accent/12 ring-1 ring-accent/25" : "glass hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                      >
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="text-[10px] font-medium leading-tight">{choice.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(barHrefs)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-accent"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit the tab bar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Press and hold Spend: four quick actions fan out above it. */}
      <AnimatePresence>
        {quickOpen ? (
          <motion.button
            key="quick-scrim"
            type="button"
            aria-label="Close quick actions"
            className="md:hidden fixed inset-0 z-[55] bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQuickOpen(false)}
          />
        ) : null}
      </AnimatePresence>
      <div
        className="md:hidden pointer-events-none fixed left-1/2 z-[56] h-0 w-0"
        style={{ bottom: "calc(5.4rem + env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence>
          {quickOpen
            ? QUICK.map((action, index) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={action.key}
                    type="button"
                    onClick={() => runQuick(action.key)}
                    className="glass-strong pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold shadow-xl"
                    // Centred on the Spend button by `translate`, so the fan-out can move in plain pixels.
                    style={{ translate: "-50% 0" }}
                    initial={still ? false : { x: 0, y: 0, scale: 0.4, opacity: 0 }}
                    animate={{ x: action.x, y: action.y - 20, scale: 1, opacity: 1 }}
                    exit={still ? undefined : { x: 0, y: 0, scale: 0.4, opacity: 0 }}
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30, delay: index * 0.035 }}
                  >
                    <Icon className="h-3.5 w-3.5 text-accent" />
                    {action.label}
                  </motion.button>
                );
              })
            : null}
        </AnimatePresence>
      </div>

      {/* Named so it stays on top, still and live, while a page changes behind it (see globals.css). */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none" style={{ viewTransitionName: "kg-tabbar" }}>
        <div className="mx-auto max-w-lg px-4 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pointer-events-auto">
          <div className="bottom-nav-shell grid grid-cols-5 items-end gap-1 px-1 pt-2 pb-1">
            {slot(bar[0]!)}
            {slot(bar[1]!)}

            <Link
              href="/spend"
              aria-label="Spend. Press and hold for quick actions."
              className="flex flex-col items-center justify-end -mt-7 select-none [-webkit-touch-callout:none]"
              onPointerDown={() => {
                held.current = false;
                window.clearTimeout(holdTimer.current);
                holdTimer.current = window.setTimeout(() => {
                  held.current = true;
                  haptic(14);
                  setQuickOpen(true);
                }, HOLD_MS);
              }}
              onPointerUp={() => window.clearTimeout(holdTimer.current)}
              onPointerLeave={() => window.clearTimeout(holdTimer.current)}
              onPointerCancel={() => window.clearTimeout(holdTimer.current)}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                // The press that opened the quick actions doesn't also open Spend.
                if (held.current) {
                  event.preventDefault();
                  held.current = false;
                }
              }}
            >
              <span
                className={cn(
                  "bottom-nav-fab tap-card flex h-14 w-14 items-center justify-center rounded-[22px] text-white shadow-lg",
                  (spendActive || quickOpen) && "ring-4 ring-accent/25"
                )}
              >
                <Wallet className="h-6 w-6" strokeWidth={2.2} />
              </span>
              <span className={cn("mt-1 text-[10px] font-semibold", spendActive ? "text-accent" : "text-muted")}>Spend</span>
            </Link>

            {slot(bar[2]!)}

            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setMoreOpen(!moreOpen);
              }}
              className="flex flex-col items-center gap-1 py-1.5"
              aria-expanded={moreOpen}
              aria-label="More navigation"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-2xl transition-all",
                  moreActive || moreOpen ? "bg-accent/15 text-accent scale-105" : "text-muted"
                )}
              >
                <LayoutGrid className="h-5 w-5" strokeWidth={moreActive || moreOpen ? 2.4 : 2} />
              </span>
              <span className={cn("text-[10px] font-medium", moreActive || moreOpen ? "text-accent font-semibold" : "text-muted")}>
                More
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
