export const FINANCE_STORAGE_KEY = "kg-finance-storage-v1";

const REMINDER_KEYS = [
  "kg-finance-dismissed-reminders",
  "kg-finance-notified-reminders",
] as const;

/** Remove all persisted finance and reminder data from localStorage. */
export function clearPersistedAppData() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(FINANCE_STORAGE_KEY);

  for (const key of REMINDER_KEYS) {
    localStorage.removeItem(key);
  }
}
