import type {
  BankHistoryDraft,
  BankHistoryEntry,
  ExpenseDraft,
  ExpenseEntry,
  FilterOption,
  Holding,
  HoldingDraft,
  HoldingType,
  IncomeDraft,
  IncomeEntry,
  Scenario,
  ScenarioDraft,
} from "@/lib/types";

export const STORAGE_KEY = "lattice-wealth-state";
export const SNAPSHOT_HISTORY_LIMIT = Number(process.env.NEXT_PUBLIC_SNAPSHOT_HISTORY_LIMIT ?? process.env.SNAPSHOT_HISTORY_LIMIT ?? 24);
export const STALE_AFTER_MS = Number(process.env.NEXT_PUBLIC_STALE_AFTER_MINUTES ?? process.env.STALE_AFTER_MINUTES ?? 20) * 60 * 1000;

export const HOLDING_TYPE_LABELS: Record<HoldingType, string> = {
  cash: "Cash",
  etf: "ETFs",
  crypto: "Crypto",
  debt: "Debts",
  manualAsset: "Manual assets",
};

export const FILTER_OPTIONS: FilterOption[] = [
  { label: "All", value: "all" },
  { label: "Cash", value: "cash" },
  { label: "ETFs", value: "etf" },
  { label: "Crypto", value: "crypto" },
  { label: "Debt", value: "debt" },
  { label: "Assets", value: "manualAsset" },
];

export const EMPTY_FORM_VALUES: HoldingDraft = {
  type: "cash",
  name: "",
  amountAud: "",
  notes: "",
  ticker: "",
  units: "",
  market: "ASX",
  symbol: "",
  cryptoAmount: "",
  assetValueAud: "",
};

export const EMPTY_INCOME_VALUES: IncomeDraft = {
  name: "",
  amount: "",
  frequency: "monthly",
  notes: "",
};

export const EMPTY_EXPENSE_VALUES: ExpenseDraft = {
  name: "",
  amount: "",
  notes: "",
};

export const EMPTY_BANK_HISTORY_VALUES: BankHistoryDraft = {
  month: "",
  endingBalanceAud: "",
  notes: "",
};

export const EMPTY_SCENARIO_VALUES: ScenarioDraft = {
  name: "",
  cashAdditionAud: "",
  debtReductionAud: "",
  assetSaleAud: "",
  notes: "",
};

export const SAMPLE_HOLDINGS: Holding[] = [
  {
    id: "cash-1",
    type: "cash",
    name: "UBank Everyday",
    amountAud: 18250,
    notes: "Main cash reserve",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "etf-1",
    type: "etf",
    name: "BetaShares Global Sustainability Leaders ETF",
    ticker: "ETHI",
    units: 124,
    market: "ASX",
    notes: "Long-term core ETF",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "etf-2",
    type: "etf",
    name: "BetaShares Global Cybersecurity ETF",
    ticker: "HACK",
    units: 76,
    market: "ASX",
    notes: "Thematic exposure",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "etf-3",
    type: "etf",
    name: "BetaShares Asia Technology Tigers ETF",
    ticker: "ASIA",
    units: 64,
    market: "ASX",
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "crypto-1",
    type: "crypto",
    name: "Bitcoin",
    symbol: "BTC",
    amount: 0.245,
    notes: "Cold wallet",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "crypto-2",
    type: "crypto",
    name: "Ethereum",
    symbol: "ETH",
    amount: 1.95,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "debt-1",
    type: "debt",
    name: "Credit card balance",
    amountAud: 1320,
    notes: "Paid monthly",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "asset-1",
    type: "manualAsset",
    name: "Car",
    valueAud: 16800,
    notes: "Estimated resale value",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
];

export const SAMPLE_INCOMES: IncomeEntry[] = [
  {
    id: "income-1",
    name: "Salary",
    amount: 7800,
    frequency: "monthly",
    notes: "After tax",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "income-2",
    name: "Freelance project",
    amount: 2400,
    frequency: "oneOff",
    notes: "Expected next month",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
];

export const SAMPLE_EXPENSES: ExpenseEntry[] = [
  {
    id: "expense-1",
    name: "Rent",
    amount: 2650,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "expense-2",
    name: "Living costs",
    amount: 1850,
    notes: "Groceries, utilities, transport",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
];

export const SAMPLE_BANK_HISTORY: BankHistoryEntry[] = [
  {
    id: "bank-history-1",
    name: "Nov 2025",
    month: "2025-11",
    endingBalanceAud: 14320,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "bank-history-2",
    name: "Dec 2025",
    month: "2025-12",
    endingBalanceAud: 15140,
    notes: "Holiday spending month",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "bank-history-3",
    name: "Jan 2026",
    month: "2026-01",
    endingBalanceAud: 16220,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "bank-history-4",
    name: "Feb 2026",
    month: "2026-02",
    endingBalanceAud: 16940,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
  {
    id: "bank-history-5",
    name: "Mar 2026",
    month: "2026-03",
    endingBalanceAud: 17610,
    notes: "",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
];

export const DEFAULT_BANK_SAFETY_BUFFER_AUD = 5000;

export const SAMPLE_SCENARIOS: Scenario[] = [
  {
    id: "scenario-1",
    name: "Sell the car and clear debt",
    cashAdditionAud: 0,
    debtReductionAud: 1320,
    assetSaleAud: 16800,
    notes: "Uses the estimated car sale value as a one-off change",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  },
];
