/**
 * "12.5+3.2" typed into the amount box means two things on one receipt.
 *
 * A deliberately tiny evaluator: + − × ÷ with the usual precedence and
 * nothing else. No eval, no parentheses, no surprises — anything it does not
 * understand is simply "not a number yet".
 */

const OPERATORS = /[+\-*/x×÷]/;

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
  const cleaned = text
    .replace(/[$,\s]/g, "")
    .replace(/[x×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[+\-*/]+$/, "");
  if (!cleaned) return null;
  if (!/^[\d.+\-*/]+$/.test(cleaned)) return null;

  const tokens = cleaned.match(/\d*\.?\d+|[+\-*/]/g);
  if (!tokens) return null;

  const values: number[] = [];
  const ops: string[] = [];
  const precedence = (op: string) => (op === "*" || op === "/" ? 2 : 1);
  const apply = (): boolean => {
    const op = ops.pop();
    const b = values.pop();
    const a = values.pop();
    if (op === undefined || a === undefined || b === undefined) return false;
    values.push(op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b);
    return true;
  };

  let expectNumber = true;
  let sign = 1;
  for (const token of tokens) {
    if (expectNumber) {
      if (token === "-") {
        sign = -sign;
        continue;
      }
      if (token === "+") continue;
      if (/[*/]/.test(token)) return null;
      const n = Number(token);
      if (!Number.isFinite(n)) return null;
      values.push(sign * n);
      sign = 1;
      expectNumber = false;
    } else {
      if (!/^[+\-*/]$/.test(token)) return null;
      while (ops.length > 0 && precedence(ops[ops.length - 1]!) >= precedence(token)) {
        if (!apply()) return null;
      }
      ops.push(token);
      expectNumber = true;
    }
  }
  if (expectNumber) return null;
  while (ops.length > 0) if (!apply()) return null;

  const result = values[0];
  if (result === undefined || !Number.isFinite(result)) return null;
  return Math.round(result * 100) / 100;
}
