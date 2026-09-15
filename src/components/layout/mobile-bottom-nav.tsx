"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Loader2, X } from "lucide-react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import {
  getLastSyncError,
  onSyncStatusChange,
  type SyncStatus,
} from "@/lib/supabase/sync";
import {
  isMoreNavActive,
  isNavActive,
  moreNavItems,
  primaryNavItems,
} from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === pathname;
  const setMoreOpen = (next: boolean) => setMoreOpenAt(next ? pathname : null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [syncConfigured, setSyncConfigured] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const moreActive = isMoreNavActive(pathname);
  const syncLink = moreNavItems.find((item) => item.href === "/sync");

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] animate-fade-in-up"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div className="md:hidden fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 animate-scale-in">
          <div className="glass-strong rounded-[28px] p-4 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <p className="font-semibold">More</p>
                <p className="text-xs text-muted">Income, accounts & history</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="w-9 h-9 rounded-full glass flex items-center justify-center text-muted"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {syncLink && (
              <Link
                href={syncLink.href}
                className="mb-4 flex items-center gap-3 rounded-2xl px-3 py-3 glass border border-white/10"
              >
                <span
                  className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center",
                    syncStatus === "error"
                      ? "bg-[#ff3b30]/15 text-[#ff3b30]"
                      : syncStatus === "syncing"
                        ? "bg-[#007aff]/15 text-[#007aff]"
                        : syncConfigured
                          ? "bg-[#34c759]/15 text-[#34c759]"
                          : "bg-[#ff9500]/15 text-[#ff9500]"
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
                    {syncConfigured === false
                      ? "Set up cloud sync"
                      : syncStatus === "syncing"
                        ? "Syncing now…"
                        : syncStatus === "error"
                          ? "Sync needs attention"
                          : "Auto-sync is on"}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {syncConfigured === false
                      ? "Add Supabase keys on Vercel"
                      : syncError ?? "Changes sync across both phones automatically"}
                  </p>
                </div>
              </Link>
            )}

            <div className="grid grid-cols-3 gap-2">
              {moreNavItems
                .filter((link) => link.href !== "/sync")
                .map((link) => {
                  const Icon = link.icon;
                  const active = isNavActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "tap-card focus-ring flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center",
                        active
                          ? "bg-[#007aff]/12 ring-1 ring-[#007aff]/25"
                          : "glass hover:bg-black/5 dark:hover:bg-white/5"
                      )}
                    >
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${link.tint}18`, color: link.tint }}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-[10px] font-medium leading-tight">{link.label}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
        <div className="mx-auto max-w-lg px-4 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pointer-events-auto">
          <div className="bottom-nav-shell grid grid-cols-4 items-end gap-1 px-1 pt-2 pb-1">
            {primaryNavItems.map((tab) => {
              const Icon = tab.icon;
              const active = isNavActive(pathname, tab.href);

              if ("primary" in tab && tab.primary) {
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-label={tab.label}
                    className="flex flex-col items-center justify-end -mt-7"
                  >
                    <span
                      className={cn(
                        "bottom-nav-fab tap-card flex h-14 w-14 items-center justify-center rounded-[22px] text-white shadow-lg",
                        active && "ring-4 ring-[#007aff]/25"
                      )}
                    >
                      <Icon className="h-6 w-6" strokeWidth={2.2} />
                    </span>
                    <span
                      className={cn(
                        "mt-1 text-[10px] font-semibold",
                        active ? "text-[#007aff]" : "text-muted"
                      )}
                    >
                      {tab.label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center gap-1 py-1.5"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-2xl transition-all",
                      active
                        ? "bg-[#007aff]/15 text-[#007aff] scale-105"
                        : "text-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      active ? "text-[#007aff] font-semibold" : "text-muted"
                    )}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex flex-col items-center gap-1 py-1.5"
              aria-expanded={moreOpen}
              aria-label="More navigation"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-2xl transition-all",
                  moreActive || moreOpen
                    ? "bg-[#007aff]/15 text-[#007aff] scale-105"
                    : "text-muted"
                )}
              >
                <LayoutGrid className="h-5 w-5" strokeWidth={moreActive || moreOpen ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  moreActive || moreOpen ? "text-[#007aff] font-semibold" : "text-muted"
                )}
              >
                More
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
