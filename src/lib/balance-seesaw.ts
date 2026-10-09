import type { Person } from "@/types";

/**
 * The see-saw on the Shared Balance page, as numbers: whose side is down, how
 * many coins sit on it, and how far the beam tips. Kept apart from the
 * drawing so the rules can be tested.
 *
 * `balance` follows the store's sign: positive means G owes Kushvanth, who
 * sits on the left.
 */
export interface SeesawTarget {
  /** Whoever is owed — their side goes down. Null when all even. */
  owed: Person | null;
  /** Coins stacked on the owed side: 2 for a few dollars, 4 for thousands. */
  coins: number;
  /** Degrees. Negative lowers the left (Kushvanth's) side. */
  tilt: number;
}

/** Below a cent there is nothing owed. */
const EVEN = 0.005;
const MIN_TILT = 4;
const EXTRA_TILT = 9;

export function seesawTarget(balance: number): SeesawTarget {
  const amount = Math.abs(balance);
  if (amount < EVEN) return { owed: null, coins: 0, tilt: 0 };
  // On a log scale, so $40 and $4,000 both read: 0.2 for a few dollars,
  // about 0.9 at four thousand, 1 from ten thousand up.
  const weight = Math.min(1, Math.max(0.2, Math.log10(amount + 1) / 4));
  const owed: Person = balance > 0 ? "kushvanth" : "g";
  return {
    owed,
    coins: 1 + Math.round(3 * weight),
    tilt: (owed === "kushvanth" ? -1 : 1) * (MIN_TILT + EXTRA_TILT * weight),
  };
}
