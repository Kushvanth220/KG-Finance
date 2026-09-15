import { ExpenseReminderProvider } from "@/components/notifications/expense-reminder-provider";
import { BalanceCelebrationOverlay } from "@/components/balance/balance-celebration";
import { AppShell } from "@/components/layout/app-shell";
import { KgSplashProvider } from "@/components/layout/kg-splash";
import { SyncProvider } from "@/components/sync/sync-provider";
import { SyncReadyGate } from "@/components/sync/sync-ready-gate";
import { SyncBanner } from "@/components/sync/sync-banner";

/**
 * Every screen of the app: header, tab bar, sync, splash, Jarvis. Routes
 * outside this group (the intro) get none of it, by construction rather than
 * by checking the path.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SyncProvider />
      <AppShell>
        <KgSplashProvider />
        <ExpenseReminderProvider />
        <BalanceCelebrationOverlay />
        <SyncBanner />
        <SyncReadyGate>{children}</SyncReadyGate>
      </AppShell>
    </>
  );
}
