/**
 * Money helpers. Amounts are stored as numbers, so every value that reaches the
 * store must already be a whole number of cents — otherwise halves of an odd
 * amount (24.21 / 2 = 12.105) each render as $12.11 and the two shares appear
 * to add up to more than the bill.
 */

/** Snap a value to whole cents, killing binary-float dust (0.1 + 0.2 cases). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Scale, round half-away-from-zero, unscale. The epsilon nudge stops values
  // like 1.005 (stored as 1.00499...) from rounding down.
  const scaled = value * 100;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return rounded / 100;
}

/**
 * Split `total` into `ways` cent-exact parts that sum back to `total` exactly.
 * The remainder cents go to the earliest parts, so a $24.21 two-way split is
 * [12.11, 12.10] — never [12.105, 12.105].
 */
export function splitMoney(total: number, ways: number): number[] {
  if (ways < 1) return [];
  const cents = Math.round(roundMoney(total) * 100);
  const base = Math.trunc(cents / ways);
  let remainder = Math.abs(cents) - Math.abs(base) * ways;
  const step = cents < 0 ? -1 : 1;

  return Array.from({ length: ways }, () => {
    let part = base;
    if (remainder > 0) {
      part += step;
      remainder -= 1;
    }
    return part / 100;
  });
}

/** True when the parts add up to the total to the cent. */
export function partsReconcile(parts: number[], total: number): boolean {
  const sum = parts.reduce((n, p) => n + Math.round(roundMoney(p) * 100), 0);
  return sum === Math.round(roundMoney(total) * 100);
}
