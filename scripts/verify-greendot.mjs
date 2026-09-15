import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { endOfMonth, startOfMonth } from "date-fns";
import {
  computeBalanceAdjustmentDeltas,
  getGreenDotActivitySummary,
  getGreenDotLedgerEntries,
  collectGreenDotAccountIds,
  getGreenDotAccounts,
} from "../src/lib/account-activity.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportPath = path.join(root, "docs/supabase-export.json");
const { data: finance } = JSON.parse(fs.readFileSync(exportPath, "utf8"));

const accounts = finance.accounts ?? [];
const transactions = finance.transactions ?? [];
const now = new Date("2026-07-30T12:00:00");

const deltas = computeBalanceAdjustmentDeltas(accounts, transactions);
console.log("=== Adjustment deltas ===");
for (const [id, delta] of deltas) {
  const transaction = transactions.find((item) => item.id === id);
  console.log(
    id.slice(0, 8),
    transaction?.person,
    transaction?.date,
    "amount",
    transaction?.amount,
    "delta",
    delta.toFixed(2),
    "prevBal",
    transaction?.previousBalance
  );
}

const summary = getGreenDotActivitySummary(accounts, transactions, now);
const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
const ledger = getGreenDotLedgerEntries(accounts, transactions, monthRange);
const ledgerNet = ledger.reduce((sum, entry) => sum + entry.signedAmount, 0);

console.log("\n=== GreenDot Activity Summary (July 2026) ===");
console.log("Kush earned:", summary.kushvanth.earnedThisMonth.toFixed(2));
console.log("Kush spent:", summary.kushvanth.spentThisMonth.toFixed(2));
console.log("Kush net:", summary.kushvanth.netThisMonth.toFixed(2));
console.log("G earned:", summary.g.earnedThisMonth.toFixed(2));
console.log("G spent:", summary.g.spentThisMonth.toFixed(2));
console.log("G net:", summary.g.netThisMonth.toFixed(2));
console.log("July adjustments:", summary.greenDotAdjustmentsThisMonth.toFixed(2));
console.log("Combined net (July):", summary.combinedNetThisMonth.toFixed(2));
console.log("Combined net (all time):", summary.combinedNetAllTime.toFixed(2));
console.log("Current balance:", summary.currentBalance.toFixed(2));
console.log("Starting balance:", summary.startingBalance.toFixed(2));

console.log("\n=== Ledger reconciliation ===");
console.log("Ledger entries:", ledger.length);
console.log("Ledger net:", ledgerNet.toFixed(2));
console.log(
  "Ledger matches combined net:",
  Math.abs(ledgerNet - summary.combinedNetThisMonth) < 0.01
);

for (const person of ["kushvanth", "g"]) {
  const personLedger = getGreenDotLedgerEntries(
    accounts,
    transactions,
    monthRange,
    person
  );
  const net = personLedger.reduce((sum, entry) => sum + entry.signedAmount, 0);
  const activityNet = summary[person].netThisMonth;
  console.log(
    `${person}: ledger ${net.toFixed(2)} vs activity ${activityNet.toFixed(2)} match=${Math.abs(net - activityNet) < 0.01}`
  );
}

console.log("\n=== All ledger lines ===");
for (const entry of ledger) {
  console.log(
    entry.kind,
    entry.person,
    entry.date,
    entry.signedAmount.toFixed(2),
    entry.label.slice(0, 50)
  );
}

console.log("\nGreenDot accounts:", getGreenDotAccounts(accounts).map((a) => ({
  id: a.id.slice(0, 8),
  balance: a.balance,
})));
console.log("Account ids:", [...collectGreenDotAccountIds(accounts, transactions, [])]);

console.log(
  "\nBalance check (starting + all-time net):",
  (summary.startingBalance + summary.combinedNetAllTime).toFixed(2)
);
