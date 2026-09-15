import { OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";
/** Static domain knowledge injected into assistant system instructions. */
export function buildAssistantKnowledgeBlock(): string {
  return `APP & DATA MODEL (KG Finance):
- Client state: Zustand finance-store (localStorage) synced to Supabase table workspace_finance (JSONB FinanceState).
- People: kushvanth, g. Ask who is speaking first. Accounts can be private or shared (shared flag).
- Transaction types: income, expense, transfer, cash_withdrawal, cash_deposit, debt_payment, credit_payment, settlement, balance_adjustment.
- Spend page fields: expense_for (kushvanth | g | both), paid_by (kushvanth | g | split), expenseShares for split amounts, account per payer.
- settlementBalance: positive means ${MEMBER_LABEL} owes ${OWNER_LABEL}; negative means ${OWNER_LABEL} owes ${MEMBER_LABEL}.
- Debts are per-person notes; payments can reduce debt and optionally debit an account.
- All amounts are USD. Use calculation tools for totals — do not guess from memory.

CALCULATION RULES:
- Monthly spend = sum of expense transactions in calendar month (respecting expenseShares per person).
- Monthly income = sum of income entries in calendar month per person.
- Net worth = account balances minus outstanding debt (use calculate_net_worth tool).
- Split expense: expense_for both with paid_by g means ${MEMBER_LABEL} paid the total and each owes half. Shares must equal the total; settlement updates when one person pays for another's share.
- Always run a read-only calculation tool before stating totals or before record_expense when math is non-trivial.`;
}
