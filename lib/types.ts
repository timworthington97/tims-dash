export type HoldingType = "cash" | "etf" | "crypto" | "debt" | "manualAsset";

interface BaseHolding {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashHolding extends BaseHolding {
  type: "cash";
  amountAud: number;
}

export interface EtfHolding extends BaseHolding {
  type: "etf";
  ticker: string;
  units: number;
  market?: string;
}

export interface CryptoHolding extends BaseHolding {
  type: "crypto";
  symbol: string;
  amount: number;
}

export interface DebtHolding extends BaseHolding {
  type: "debt";
  amountAud: number;
}

export interface ManualAssetHolding extends BaseHolding {
  type: "manualAsset";
  valueAud: number;
}

export type Holding = CashHolding | EtfHolding | CryptoHolding | DebtHolding | ManualAssetHolding;

export interface HoldingDraft {
  id?: string;
  createdAt?: string;
  type: HoldingType;
  name: string;
  notes: string;
  amountAud: string;
  ticker: string;
  units: string;
  market: string;
  symbol: string;
  cryptoAmount: string;
  assetValueAud: string;
}

export type IncomeFrequency = "monthly" | "fortnightly" | "weekly" | "yearly" | "oneOff";

interface BaseEntry {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeEntry extends BaseEntry {
  amount: number;
  frequency: IncomeFrequency;
}

export interface ExpenseEntry extends BaseEntry {
  amount: number;
}

export interface BankHistoryEntry extends BaseEntry {
  month: string;
  endingBalanceAud: number;
  accountName?: string;
  accountId?: string;
}

export interface Scenario extends BaseEntry {
  cashAdditionAud: number;
  debtReductionAud: number;
  assetSaleAud: number;
}

export interface IncomeDraft {
  id?: string;
  createdAt?: string;
  name: string;
  amount: string;
  frequency: IncomeFrequency;
  notes: string;
}

export interface ExpenseDraft {
  id?: string;
  createdAt?: string;
  name: string;
  amount: string;
  notes: string;
}

export interface BankHistoryDraft {
  id?: string;
  createdAt?: string;
  month: string;
  endingBalanceAud: string;
  accountName: string;
  accountId: string;
  notes: string;
}

export interface ScenarioDraft {
  id?: string;
  createdAt?: string;
  name: string;
  cashAdditionAud: string;
  debtReductionAud: string;
  assetSaleAud: string;
  notes: string;
}

export interface PriceData {
  holdingId: string;
  assetType: "etf" | "crypto";
  symbol: string;
  unitPriceAud: number | null;
  source: string;
  fetchedAt: string;
  status: "live" | "delayed" | "stale" | "mock" | "error";
  error?: string;
  quoteCurrency?: string | null;
  originalUnitPrice?: number | null;
  statusText?: string;
  detailText?: string;
}

export type PriceMap = Record<string, PriceData>;

export interface RefreshSummary {
  requested: number;
  updated: number;
  failed: number;
  timedOut: boolean;
  durationMs: number;
}

export interface RefreshInsightCategory {
  label: string;
  deltaAud: number;
}

export interface RefreshInsightMover {
  name: string;
  deltaAud: number;
}

export interface RefreshInsight {
  categories: RefreshInsightCategory[];
  movers: RefreshInsightMover[];
}

export type InsightConfidenceLevel = "high" | "medium" | "low";

export interface InsightSectionItem {
  id: string;
  text: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}

export interface InsightConfidenceSummary {
  level: InsightConfidenceLevel;
  label: string;
  reason: string;
}

export interface DashboardInsights {
  greeting: string;
  lastCheckLabel: string | null;
  sinceLastCheck: string;
  comparisons: InsightSectionItem[];
  changes: InsightSectionItem[];
  watchouts: InsightSectionItem[];
  recommendation: string;
  confidence: InsightConfidenceSummary;
}

export interface PortfolioSnapshot {
  id: string;
  timestamp: string;
  totalNetWorth: number;
  totalLiquidValue?: number;
  totalCash: number;
  totalEtfValue: number;
  totalCryptoValue: number;
  totalDebtValue: number;
  status: "success" | "partial";
  failedHoldings: number;
}

export interface ValuedHolding {
  id: string;
  raw: Holding;
  name: string;
  type: HoldingType;
  notes: string;
  badge: string | null;
  subtitle: string;
  quantityLabel: string;
  priceLabel: string;
  valueAud: number;
  priceStatus: "ok" | "fallback" | "stale" | "error";
  statusLabel: string;
  error: string | null;
}

export interface PortfolioView {
  holdings: ValuedHolding[];
  latestSnapshot: PortfolioSnapshot | null;
  totals: {
    liquid: number;
    netWorth: number;
    cash: number;
    etf: number;
    crypto: number;
    debt: number;
    manualAsset: number;
  };
}

export interface MonthlyCashflowSummary {
  recurringIncome: number;
  oneOffIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
}

export interface ProjectionPoint {
  label: string;
  monthIndex: number;
  balance: number;
  delta: number;
}

export interface ProjectionSummary {
  series: ProjectionPoint[];
  monthlyNet: number;
  monthlyExpenses: number;
  recurringIncome: number;
  oneOffIncome: number;
  runwayMonths: number | null;
}

export interface TrendPoint {
  label: string;
  value: number;
  dateLabel?: string;
}

export type BankProjectionMode = "liquid" | "bankCash";
export type BankTrendRange = "3m" | "6m" | "12m" | "all";

export interface BankTrendSummary {
  points: TrendPoint[];
  changeAud: number | null;
  averageMonthlyChangeAud: number | null;
}

export interface UbankTransactionRow {
  date: string;
  description: string;
  debitAud: number | null;
  creditAud: number | null;
  amountAud: number | null;
  balanceAud: number | null;
}

export interface UbankImportReview {
  fileName: string;
  accountName: string | null;
  accountId: string | null;
  statementLabel: string;
  statementStartDate: string | null;
  statementEndDate: string | null;
  detectedMonth: string;
  endingBalanceAud: number | null;
  transactionCount: number;
  transactions: UbankTransactionRow[];
  statementSignature: string;
  fileFingerprint: string;
  manualBalanceRequired?: boolean;
}

export type UbankImportItemStatus = "ready" | "needs_input" | "duplicate" | "error";

export interface UbankImportBatchItem {
  id: string;
  fileName: string;
  status: UbankImportItemStatus;
  review: UbankImportReview | null;
  error: string | null;
  duplicateReason: string | null;
  manualBalanceAud?: string;
}

export interface ScenarioComparison {
  scenarioNetWorth: number;
  deltaNetWorth: number;
  currentRunwayMonths: number | null;
  scenarioRunwayMonths: number | null;
  runwayDeltaMonths: number | null;
  currentTwelveMonthBalance: number;
  scenarioTwelveMonthBalance: number;
  twelveMonthDelta: number;
}

export interface HoldingGroup {
  type: HoldingType;
  label: string;
  items: ValuedHolding[];
}

export interface PriceRequestItem {
  holdingId: string;
  kind: "etf" | "crypto";
  symbol: string;
  market?: string;
}

export interface PriceRequestResult {
  holdingId: string;
  kind: "etf" | "crypto";
  symbol: string;
  unitPriceAud: number | null;
  source: string;
  fetchedAt: string;
  status: "live" | "delayed" | "stale" | "mock" | "error";
  error?: string;
  quoteCurrency?: string | null;
  originalUnitPrice?: number | null;
  statusText?: string;
  detailText?: string;
}

export interface PricingResponse {
  prices: PriceRequestResult[];
  summary: RefreshSummary;
  error?: string;
}

export interface PortfolioAppState {
  holdings: Holding[];
  prices: PriceMap;
  snapshots: PortfolioSnapshot[];
  lastRefreshedAt: string | null;
  lastViewedAt: string | null;
  previousViewedAt: string | null;
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  bankHistory: BankHistoryEntry[];
  scenarios: Scenario[];
}

export interface FilterOption {
  label: string;
  value: HoldingType | "all";
}
