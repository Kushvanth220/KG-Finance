import { formatCurrency } from "./formatters";
import { getSettlementSummary } from "./settlement";
import { useBalanceCelebrationStore } from "@/store/balance-celebration-store";
import { PERSON_LABELS, type SettlementEntry } from "@/types";

export interface BalanceCelebrationPayload {
  title: string;
  subtitle: string;
  emoji: string;
  sparkles: string[];
  balanceLabel: string;
}

const SKIP_MESSAGES = new Set(["Starting balance", "Manual balance adjustment"]);

function pickVariant<T>(items: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % items.length;
  }
  return items[hash]!;
}

export function buildBalanceCelebration(
  newEntries: SettlementEntry[],
  balanceAfter: number
): BalanceCelebrationPayload | null {
  const entries = newEntries.filter(
    (entry) => !entry.autoMessage || !SKIP_MESSAGES.has(entry.autoMessage)
  );
  if (entries.length === 0) return null;

  const summary = getSettlementSummary(balanceAfter);
  const balanceLabel =
    summary.amount === 0
      ? summary.label
      : `${summary.label} · ${formatCurrency(summary.amount)}`;

  if (Math.abs(balanceAfter) < 0.01) {
    return pickVariant(
      [
        {
          title: "Perfectly even",
          subtitle: "Nobody owes anybody — the balance is back to zero.",
          emoji: "🎉",
          sparkles: ["✨", "💫", "🌟", "🎊", "⭐"],
          balanceLabel,
        },
        {
          title: "All squared up",
          subtitle: "Settled to the cent.",
          emoji: "⚖️",
          sparkles: ["✨", "🥳", "💫", "🌈", "⭐"],
          balanceLabel,
        },
      ],
      entries.map((e) => e.id).join("-")
    );
  }

  if (entries.length > 1) {
    return pickVariant(
      [
        {
          title: "Split recorded",
          subtitle: "Each share is on the balance — nothing to remember later.",
          emoji: "🧾",
          sparkles: ["✨", "💫", "🌟", "⭐", "🎊"],
          balanceLabel,
        },
        {
          title: "Balance updated",
          subtitle: "Both shares logged. The running total is current.",
          emoji: "🔄",
          sparkles: ["💙", "✨", "🌟", "💫", "⭐"],
          balanceLabel,
        },
      ],
      entries.map((e) => e.id).join("-")
    );
  }

  const entry = entries[0]!;
  const amountText = formatCurrency(entry.amount);
  const payer = PERSON_LABELS[entry.paidBy];
  const beneficiary = PERSON_LABELS[entry.benefited];

  if (entry.paidBy !== entry.benefited) {
    return pickVariant(
      [
        {
          title: "Covered",
          subtitle: `${payer} covered ${amountText} for ${beneficiary}.`,
          emoji: "💙",
          sparkles: ["✨", "💙", "⭐", "💫", "🌟"],
          balanceLabel,
        },
        {
          title: "On the balance",
          subtitle: `${payer} paid ${amountText} — ${beneficiary} now owes it back.`,
          emoji: "🌟",
          sparkles: ["💙", "✨", "🎉", "💫", "⭐"],
          balanceLabel,
        },
      ],
      entry.id
    );
  }

  return {
    title: "Balance updated",
    subtitle: "The shared balance has been recalculated.",
    emoji: "🔄",
    sparkles: ["✨", "⭐", "💫", "🌟", "🎊"],
    balanceLabel,
  };
}

export function celebrateBalanceUpdate(
  newEntries: SettlementEntry[],
  balanceAfter: number
) {
  const payload = buildBalanceCelebration(newEntries, balanceAfter);
  if (!payload) return;
  useBalanceCelebrationStore.getState().show(payload);
}
