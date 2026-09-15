/**
 * Splits an assistant reply into plain text and markdown tables.
 *
 * The assistant answers "pull up my accounts" with a markdown table, and the
 * chat used to print the raw string, so those arrived as literal pipes and
 * dashes. Kept separate from the renderer so the parsing is unit-testable.
 *
 * Deliberately minimal: only the constructs the assistant actually emits.
 */

export type MessageBlock =
  | { kind: "text"; lines: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** A markdown separator row: |---|:--:|---| */
function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

/** Needs a leading pipe AND a second one, so prose like "A | B" is left alone. */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.indexOf("|", 1) > 0;
}

export function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content.split("\n");
  const blocks: MessageBlock[] = [];
  let text: string[] = [];

  const flushText = () => {
    if (text.length) blocks.push({ kind: "text", lines: text });
    text = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    // A table is a header row, a separator, then one or more body rows.
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const head = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]!)) {
        rows.push(splitRow(lines[j]!));
        j += 1;
      }
      flushText();
      blocks.push({ kind: "table", head, rows });
      i = j - 1;
      continue;
    }
    text.push(line);
  }
  flushText();
  return blocks;
}
