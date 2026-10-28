/**
 * Category names that look misspelled, and what they were most likely meant
 * to be: "Settelment" → "Settlement", "Eduction Loan" → "Education Loan".
 *
 * Each word of a name is compared with everyday money words. A word one or two
 * letters away from one of them, and not itself on the list, is a likely typo.
 * Short words are left alone (there are too many near-misses among them), and
 * a plural is never "corrected" to its singular or back.
 */

const WORDS = new Set(
  `account another bank beauty bill bills birthday books cash car card care charity childcare clear clothes clothing
   coffee college cosmetics credit cut daycare debit debt dining donation education electric electricity electronics
   emergency emi entertainment family fee fees fine fines fitness flight food fuel furniture games gas gift gifts groceries
   grocery gym hair haircut health hotel household india insurance internet laundry loan maintenance medical medicine
   miscellaneous mobile movies music other parking payment personal pets pharmacy phone rent repair restaurant restaurants
   ride room salary savings settlement shopping snacks software streaming subscription subscriptions supplies tax taxes
   taxi toll tolls transfer transport transportation travel tuition uber utilities utility water wifi withdraw withdrawal`
    .split(/\s+/)
    .filter(Boolean)
);

/** Letters to add, drop or swap to turn one word into the other. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

const plural = (a: string, b: string) => a === `${b}s` || b === `${a}s`;

/** The everyday word this one was probably meant to be, or null. */
function fixWord(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower.length < 4 || WORDS.has(lower) || /\d/.test(lower)) return null;
  const allowed = lower.length >= 6 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = allowed + 1;
  for (const candidate of WORDS) {
    if (Math.abs(candidate.length - lower.length) > allowed || plural(candidate, lower)) continue;
    const d = distance(lower, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  if (!best) return null;
  // Keep the writer's capitals: "Settelment" → "Settlement", "settelment" → "settlement".
  return word[0] === word[0]!.toUpperCase() ? best[0]!.toUpperCase() + best.slice(1) : best;
}

/** The name with every likely typo fixed, or null when it reads fine. */
export function suggestCategoryName(name: string): string | null {
  let changed = false;
  const fixed = name.replace(/[A-Za-z]+/g, (word) => {
    const fix = fixWord(word);
    if (!fix) return word;
    changed = true;
    return fix;
  });
  return changed ? fixed : null;
}
