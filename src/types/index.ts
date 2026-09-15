import { OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";

export type Person = "kushvanth" | "g";

export type AccountType = "credit" | "debit" | "cash";

export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "cash_withdrawal"
  | "cash_deposit"
  | "debt_payment"
  | "credit_payment"
  | "settlement"
  | "balance_adjustment";

export interface IncomeSource {
  id: string;
  person: Person;
  name: string;
}

export type IncomeDepositType = "cash" | "debit";

export interface IncomeEntry {
  id: string;
  person: Person;
  sourceId: string;
  amount: number;
  date: string;
  time?: string;
  timestamp?: string;
  notes?: string;
  depositType: IncomeDepositType;
  depositAccountId: string;
}

export interface SpendCategory {
  id: string;
  name: string;
  keywords?: string[];
  /** Monthly budget in dollars; absent means "not budgeted". */
  budget?: number;
  /** One emoji shown on the category tile; guessed from the name when absent. */
  emoji?: string;
  /** Tile accent colour (hex); guessed from the name when absent. */
  color?: string;
}

export interface MonthlyExpense {
  id: string;
  person: Person;
  name: string;
  amount: number | null;
  isVariable: boolean;
  isRecurring: boolean;
  oneTimeMonth?: number;
  oneTimeYear?: number;
  isPaid?: boolean;
  /** Day of month when payment is due (recurring) */
  dueDayOfMonth?: number;
  /** Full due date for one-time expenses (yyyy-MM-dd) */
  dueDate?: string;
}

export interface Account {
  id: string;
  person: Person;
  name: string;
  type: AccountType;
  balance: number;
  creditLimit?: number;
  /** Workspace account used by both people (e.g. shared GreenDot debit). */
  shared?: boolean;
}

export interface Debt {
  id: string;
  person: Person;
  name: string;
  amount: number;
  linkedAccountId?: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  person: Person;
  amount: number;
  date: string;
  time: string;
  timestamp?: string;
  category?: string;
  accountId?: string;
  sourceAccountId?: string;
  targetAccountId?: string;
  beneficiaryPerson?: Person;
  paidByPerson?: Person;
  notes?: string;
  autoMessage?: string;
  paymentMethod?: string;
  monthlyExpenseId?: string;
  expenseOwner?: Person;
  /** Per-person share when expense is split (e.g. both ate, $10 each). */
  expenseShares?: Partial<Record<Person, number>>;
  plannedAmount?: number;
  categoryPaidBefore?: number;
  categoryRemaining?: number;
  debtRemaining?: number;
  /** Account balance before a manual adjustment (for reversal on delete). */
  previousBalance?: number;
  /** Money that came BACK: an expense with a negative amount, so every sum nets it out. */
  refund?: boolean;
}

export interface SettlementEntry {
  id: string;
  date: string;
  time: string;
  timestamp?: string;
  amount: number;
  paidBy: Person;
  benefited: Person;
  notes?: string;
  autoMessage?: string;
  runningBalance: number;
  sourceTransactionId?: string;
}

/** Permanent audit log entry when a transaction is deleted from History. */
export interface DeletedHistoryRecord {
  id: string;
  deletedAt: string;
  /** Who removed this from active History (Kushvanth or G). */
  deletedBy?: Person;
  primaryTransactionId: string;
  transactions: Transaction[];
  removedSettlementEntries: SettlementEntry[];
  removedIncomeEntry?: IncomeEntry;
  monthlyExpense?: {
    id: string;
    name: string;
    person: Person;
    amount: number | null;
    isVariable: boolean;
    isRecurring: boolean;
  };
  context: {
    accounts: Record<string, { name: string; type: AccountType; person: Person }>;
    debts: Record<string, { name: string; person: Person }>;
    incomeSources: Record<string, { name: string; person: Person }>;
  };
  summary: string;
}

/** One part of one Flex block: its base pay, or its tips once known. */
export interface FlexDepositPart {
  entryId: string;
  part: "base" | "tip";
  amount: number;
  /** yyyy-MM-dd the block was driven. */
  blockDate: string;
}

/**
 * A Flex payout that landed. Income is written from this, dated the day the
 * money arrived, never from the block itself.
 */
export interface FlexDeposit {
  id: string;
  /** yyyy-MM-dd the money landed. */
  date: string;
  accountId: string;
  /** What the covered blocks added up to. */
  expected: number;
  /** What the bank actually showed. */
  actual: number;
  parts: FlexDepositPart[];
  note?: string;
  createdAt: string;
  /** Confirmed by the app on payout day rather than by a tap. */
  auto?: boolean;
}

export interface FinanceState {
  incomeSources: IncomeSource[];
  incomeEntries: IncomeEntry[];
  spendCategories: SpendCategory[];
  monthlyExpenses: MonthlyExpense[];
  accounts: Account[];
  debts: Debt[];
  transactions: Transaction[];
  settlementHistory: SettlementEntry[];
  /** Positive = G owes Kushvanth */
  settlementBalance: number;
  /** Append-only log of deleted transactions — never removed by delete or reset. */
  deletedHistory: DeletedHistoryRecord[];
  /** Accounts-page GreenDot panel only counts activity on/after this date (yyyy-MM-dd). */
  greenDotTrackingStartDate?: string;
  /** Flex payouts confirmed as landed; absent on records from before this existed. */
  flexDeposits?: FlexDeposit[];
}

export const PERSON_LABELS: Record<Person, string> = {
  kushvanth: OWNER_LABEL,
  g: MEMBER_LABEL,
};
