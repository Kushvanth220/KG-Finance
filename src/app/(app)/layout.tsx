import { ExpenseReminderProvider } from "@/components/notifications/expense-reminder-provider";
import { BalanceCelebrationOverlay } from "@/components/balance/balance-celebration";
import { LaunchSplash } from "@/components/brand/launch-splash";
import { AppShell } from "@/components/layout/app-shell";
import { PageTransition } from "@/components/layout/page-transition";
import { SmoothScroll } from "@/components/layout/smooth-scroll";
import { SyncProvider } from "@/components/sync/sync-provider";
import { SyncReadyGate } from "@/components/sync/sync-ready-gate";
import { SyncBanner } from "@/components/sync/sync-banner";

/**
 * Every screen of the app: the launch screen, header, tab bar, sync, the
 * handover between screens, the assistant. Routes
 * outside this group (the intro) get none of it, by construction rather than
 * by checking the path.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LaunchSplash />
      <SyncProvider />
      <SmoothScroll />
      <AppShell>
        <ExpenseReminderProvider />
        <BalanceCelebrationOverlay />
        <SyncBanner />
        <SyncReadyGate>
          <PageTransition>{children}</PageTransition>
        </SyncReadyGate>
      </AppShell>
    </>
  );
}
