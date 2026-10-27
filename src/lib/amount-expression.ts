import { calculate } from "@/lib/calculator";

/**
 * "12.5+3.2" typed into the amount box means two things on one receipt.
 *
 * The box understands what the calculator does (+ − × ÷, brackets, and a
 * percent such as "45+18%" for a tip) and nothing else: no eval, and anything
 * it does not understand is simply "not a number yet".
 */

const OPERATORS = /[+\-*/x×÷−%()]/;

/** True when the text is an expression rather than a plain number. */
export function hasOperator(text: string): boolean {
  // A leading sign is a sign, not arithmetic.
  return OPERATORS.test(text.trim().replace(/^[-+]/, ""));
}

/**
 * The value of the text so far, to the cent. A trailing operator ("12.5+") is
 * treated as "still typing" and ignored; an invalid expression is null.
 */
export function evaluateAmount(text: string): number | null {
  const value = calculate(text);
  if (value === null) return null;
  const cents = Math.round(value * 100) / 100;
  return Object.is(cents, -0) ? 0 : cents;
}
