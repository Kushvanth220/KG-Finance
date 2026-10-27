/**
 * The Spend page's calculator: + − × ÷, brackets and percent.
 *
 * Percent works the way a phone calculator does: on its own "18%" is 0.18,
 * but added to or taken from something it is a share of that thing, so
 * "45 + 18%" is a $45 bill with an 18% tip, 53.10. While a sum is still being
 * typed, a trailing operator is ignored and open brackets are closed, so the
 * answer can be shown as you go. No eval: anything it does not understand is
 * simply "not a number yet" (null).
 */

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  const source = text.replace(/[$,\s]/g, "").replace(/[x×]/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/[\d.]/.test(ch)) {
      let raw = "";
      while (i < source.length && /[\d.]/.test(source[i]!)) raw += source[i++];
      // "12." is twelve while typing; "1.2.3" is nothing.
      if ((raw.match(/\./g) ?? []).length > 1 || raw === ".") return null;
      tokens.push({ kind: "num", value: Number(raw) });
      continue;
    }
    if ("+-*/()%".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

/** A value, and whether it was written as a bare percent ("18%"). */
interface Part {
  value: number;
  percent: boolean;
}

/** The value of a sum, or null when it isn't one (yet). Not rounded. */
export function calculate(text: string): number | null {
  const all = tokenize(text);
  if (!all || all.length === 0) return null;
  // Still typing: drop a trailing operator (but not a closing bracket or percent).
  const tokens = [...all];
  for (let last = tokens[tokens.length - 1]; last?.kind === "op" && "+-*/(".includes(last.value); ) {
    tokens.pop();
    last = tokens[tokens.length - 1];
  }
  if (tokens.length === 0) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (value: string) => {
    const token = peek();
    if (token?.kind === "op" && token.value === value) {
      pos += 1;
      return true;
    }
    return false;
  };

  // primary := number | "(" expr ")"   (a bracket left open is closed at the end)
  const primary = (): Part => {
    if (eat("(")) {
      const inner = expr();
      eat(")");
      return { value: inner, percent: false };
    }
    const token = peek();
    if (token?.kind !== "num") throw new Error("number expected");
    pos += 1;
    return { value: token.value, percent: false };
  };

  // postfix := primary "%"?
  const postfix = (): Part => {
    const base = primary();
    if (eat("%")) return { value: base.value / 100, percent: true };
    return base;
  };

  // unary := ("-" | "+") unary | postfix
  const unary = (): Part => {
    if (eat("-")) {
      const inner = unary();
      return { value: -inner.value, percent: inner.percent };
    }
    if (eat("+")) return unary();
    return postfix();
  };

  // term := unary (("*" | "/") unary)*
  const term = (): Part => {
    let left = unary();
    for (;;) {
      if (eat("*")) left = { value: left.value * unary().value, percent: false };
      else if (eat("/")) {
        const right = unary().value;
        if (right === 0) throw new Error("division by zero");
        left = { value: left.value / right, percent: false };
      } else return left;
    }
  };

  // expr := term (("+" | "-") term)*, where "+ n%" is n% of what came before.
  function expr(): number {
    let left = term().value;
    for (;;) {
      if (eat("+")) {
        const right = term();
        left = right.percent ? left + left * right.value : left + right.value;
      } else if (eat("-")) {
        const right = term();
        left = right.percent ? left - left * right.value : left - right.value;
      } else return left;
    }
  }

  try {
    const value = expr();
    if (pos !== tokens.length) return null;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** True when the text asks for any working out, not just a number. */
export function isCalculation(text: string): boolean {
  return /[+\-*/x×÷−()%]/.test(text.trim().replace(/^[-+]/, ""));
}

/** A result as a calculator shows it: up to 8 decimals, no trailing zeros, grouped thousands. */
export function formatCalculation(value: number): string {
  const rounded = Math.round(value * 1e8) / 1e8;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/** What the amount field takes: to the cent, as plain digits. */
export function toAmountText(value: number): string {
  const cents = Math.round(value * 100) / 100;
  return String(Object.is(cents, -0) ? 0 : cents);
}

/** One worked-out sum, kept so it can be looked back on or used again. */
export interface CalculationRecord {
  id: string;
  expression: string;
  result: number;
  at: string;
}

/** History keeps this many, newest first. */
export const HISTORY_LIMIT = 30;

/** The history with one more sum at the top: the same sum again moves up instead of repeating. */
export function addToHistory(history: CalculationRecord[], record: CalculationRecord): CalculationRecord[] {
  const rest = history.filter((item) => item.expression !== record.expression);
  return [record, ...rest].slice(0, HISTORY_LIMIT);
}

/** Saved history, made safe: anything malformed is dropped. */
export function parseHistory(raw: string | null): CalculationRecord[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is CalculationRecord =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.expression === "string" &&
          typeof item.result === "number" &&
          Number.isFinite(item.result) &&
          typeof item.at === "string"
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}
