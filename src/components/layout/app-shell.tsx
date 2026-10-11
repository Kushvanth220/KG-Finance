"use client";

import { KgLogo } from "@/components/layout/kg-logo";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AssistantFloatingButton } from "@/components/assistant/assistant-floating-button";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { SyncStatusBadge } from "@/components/sync/sync-status";
import { FlexIncomeBridge } from "@/components/flex/flex-income-bridge";
import { FirstVisitGate } from "@/components/layout/first-visit-gate";

export function AppShell({ children }: { children: React.ReactNode }) {
  // <main> rises once, when the app opens. Changing page is PageTransition's
  // job; <main> used to be keyed on the route, which rebuilt everything in it
  // (the alarm, the sync banner, the page move itself) on every tap.
  return (
    <AssistantProvider>
      <FlexIncomeBridge />
      <FirstVisitGate />
      <div className="min-h-dvh flex flex-col">
      <div className="mesh-bg" />

      <header className="sticky top-0 z-40 glass-strong border-b border-white/10" style={{ viewTransitionName: "kg-header" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 md:py-4 flex items-center justify-between gap-3">
          <KgLogo size="header" />
          <DesktopNav />
          <SyncStatusBadge />
        </div>
      </header>

      <main
        className="kg-rise flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-8"
      >
        {children}
      </main>

      <MobileBottomNav />
      <AssistantFloatingButton />
    </div>
    </AssistantProvider>
  );
}
