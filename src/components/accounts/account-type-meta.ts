import { Banknote, CreditCard, Landmark } from "lucide-react";
import type { AccountType } from "@/types";

/**
 * How each kind of account is named, drawn and tinted wherever it appears as
 * a card — the Home grid and the wallet stack read the same table, so a bank
 * is never green in one and blue in the other. Cards are red because what a
 * card holds is money owed.
 */
export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: typeof Landmark; tint: string }> = {
  debit: { label: "Bank", icon: Landmark, tint: "var(--success)" },
  cash: { label: "Cash", icon: Banknote, tint: "var(--amber)" },
  credit: { label: "Card", icon: CreditCard, tint: "var(--danger)" },
};
