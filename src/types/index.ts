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

/** Where money sent abroad lands. The currency follows from it (lib/remittances). */
export type RemittanceCountry = "IN" | "PH";

export type RemittanceCurrency = "INR" | "PHP";

export type RemittanceMethod = "remitly" | "wise" | "western_union" | "bank_transfer" | "other";

export type RemittanceReason =
  | "family"
  | "household"
  | "medical"
  | "education"
  | "savings"
  | "gift"
  | "other";

/**
 * Money sent from the US to India or the Philippines, as it actually happened.
 *
 * Both sides are stored as recorded — the dollars that left and the rupees or
 * pesos that arrived — and so is the rate between them. A live rate is never
 * written back into a past transfer; `marketRate` is kept only to compare.
 *
 * A standalone record: it does not move an account balance or write a History
 * row, so a transfer already logged as a spend is not counted twice.
 */
export interface Remittance {
  id: string;
  /** Who sent it. */
  person: Person;
  /** yyyy-MM-dd, in the app's time zone. */
  date: string;
  country: RemittanceCountry;
  /** What was converted, in US dollars — before any fee. */
  usdAmount: number;
  /** What arrived, in the destination currency (INR for India, PHP for the Philippines). */
  receivedAmount: number;
  /** Destination currency per 1 USD for this transfer, as recorded. */
  rate: number;
  /** The market rate shown when this was recorded, for comparison only. */
  marketRate?: number;
  /** Charged on top of `usdAmount`, in US dollars. Never part of the amount sent. */
  feeUsd?: number;
  method: RemittanceMethod;
  /** The service's name, when `method` is "other". */
  methodName?: string;
  reason: RemittanceReason;
  /** The sender's own words. */
  note?: string;
  /** ISO time it was recorded. */
  createdAt: string;
  updatedAt?: string;
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
  /** Money sent abroad; absent on records from before this existed. */
  remittances?: Remittance[];
}

export const PERSON_LABELS: Record<Person, string> = {
  kushvanth: OWNER_LABEL,
  g: MEMBER_LABEL,
};
