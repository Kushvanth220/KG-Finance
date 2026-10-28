"use client";

import { useEffect, useState } from "react";
import { KgLogo } from "@/components/layout/kg-logo";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AssistantFloatingButton } from "@/components/assistant/assistant-floating-button";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { SyncStatusBadge } from "@/components/sync/sync-status";
import { FlexIncomeBridge } from "@/components/flex/flex-income-bridge";
import { FirstVisitGate } from "@/components/layout/first-visit-gate";

/**
 * Whether the page has been scrolled away from the top, with a little slack
 * either side so the header doesn't flicker at the edge.
 */
function useScrolledAway(): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      setAway((was) => (was ? y > 16 : y > 48));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    // A page opened part-way down (back, a link to a row) starts slim.
    frame = requestAnimationFrame(check);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return away;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Once the page scrolls, the header slims down so the page gets the room (globals.css).
  const compact = useScrolledAway();
  // <main> rises once, when the app opens. Changing page is PageTransition's
  // job; <main> used to be keyed on the route, which rebuilt everything in it
  // (the alarm, the sync banner, the page move itself) on every tap.
  //
  // It clips sideways at the screen's edge: on a phone, anything poking past it
  // (a card mid-animation, a too-wide row) zooms the whole page out for a
  // moment and cancels a page move. `clip`, unlike `hidden`, makes no scroll
  // box, so sticky and fixed things inside behave as before.
  return (
    <AssistantProvider>
      <FlexIncomeBridge />
      <FirstVisitGate />
      <div className="min-h-dvh flex flex-col">
      <div className="mesh-bg" />

      <header
        className="kg-app-header sticky top-0 z-40 glass-strong border-b border-white/10"
        style={{ viewTransitionName: "kg-header" }}
        data-compact={compact}
      >
        <div className="kg-header-inner max-w-6xl mx-auto px-4 py-3 md:py-4 flex items-center justify-between gap-3">
          <KgLogo size="header" />
          <DesktopNav />
          <SyncStatusBadge />
        </div>
      </header>

      <main
        className="kg-rise flex-1 max-w-6xl w-full mx-auto overflow-x-clip px-4 py-6 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-8"
      >
        {children}
      </main>

      <MobileBottomNav />
      <AssistantFloatingButton />
    </div>
    </AssistantProvider>
  );
}
