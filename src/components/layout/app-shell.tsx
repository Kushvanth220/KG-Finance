"use client";

import { usePathname } from "next/navigation";
import { KgLogo } from "@/components/layout/kg-logo";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AssistantFloatingButton } from "@/components/assistant/assistant-floating-button";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { SyncStatusBadge } from "@/components/sync/sync-status";
import { FlexIncomeBridge } from "@/components/flex/flex-income-bridge";
import { FirstVisitGate } from "@/components/layout/first-visit-gate";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Keying <main> on the route replays the entrance animation on every
  // navigation, so pages arrive instead of blinking into place.
  const pathname = usePathname();

  return (
    <AssistantProvider>
      <FlexIncomeBridge />
      <FirstVisitGate />
      <div className="min-h-dvh flex flex-col">
      <div className="mesh-bg" />

      <header className="sticky top-0 z-40 glass-strong border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 md:py-4 flex items-center justify-between gap-3">
          <KgLogo size="header" />
          <DesktopNav />
          <SyncStatusBadge />
        </div>
      </header>

      <main
        key={pathname}
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
