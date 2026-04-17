import {
  DEFAULT_BANK_SAFETY_BUFFER_AUD,
  EMPTY_BANK_HISTORY_VALUES,
  EMPTY_EXPENSE_VALUES,
  EMPTY_INCOME_VALUES,
  EMPTY_SCENARIO_VALUES,
  HOLDING_TYPE_LABELS,
} from "@/lib/constants";
import { formatAud, formatPriceLabel, formatQuantity, formatSourceLabel } from "@/lib/format";
import type {
  BankHistoryDraft,
  BankHistoryEntry,
  BankTrendRange,
  BankTrendSummary,
  ExpenseDraft,
  ExpenseEntry,
  Holding,
  HoldingDraft,
  HoldingGroup,
  HoldingType,
  IncomeDraft,
  IncomeEntry,
  MonthlyCashflowSummary,
  PortfolioSnapshot,
  PortfolioView,
  PriceMap,
  ProjectionPoint,
  PriceRequestItem,
  PriceRequestResult,
  RefreshInsight,
  ProjectionSummary,
  Scenario,
  ScenarioComparison,
  ScenarioDraft,
  ValuedHolding,
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(offset: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(date);
}

function monthLabelFromValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function validateHoldingDraft(draft: HoldingDraft) {
  const errors: string[] = [];

  if (!draft.name.trim()) {
    errors.push("Name is required.");
  }

  if (draft.type === "cash" || draft.type === "debt") {
    if (parseNumber(draft.amountAud) <= 0) {
      errors.push("Amount in AUD must be greater than zero.");
    }
  }

  if (draft.type === "manualAsset" && parseNumber(draft.assetValueAud) <= 0) {
    errors.push("Estimated value must be greater than zero.");
  }

  if (draft.type === "etf") {
    if (!draft.ticker.trim()) {
      errors.push("Ticker is required for ETFs.");
    }

    if (parseNumber(draft.units) <= 0) {
      errors.push("Units must be greater than zero.");
    }
  }

  if (draft.type === "crypto") {
    if (!draft.symbol.trim()) {
      errors.push("Coin symbol or ID is required for crypto holdings.");
    }

    if (parseNumber(draft.cryptoAmount) <= 0) {
      errors.push("Crypto amount must be greater than zero.");
    }
  }

  return errors;
}

export function buildHoldingFromDraft(draft: HoldingDraft): Holding {
  const timestamp = nowIso();
  const shared = {
    id: draft.id ?? randomId(draft.type),
    type: draft.type,
    name: draft.name.trim(),
    notes: draft.notes.trim(),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  switch (draft.type) {
    case "cash":
      return { ...shared, type: "cash", amountAud: parseNumber(draft.amountAud) };
    case "debt":
      return { ...shared, type: "debt", amountAud: parseNumber(draft.amountAud) };
    case "manualAsset":
      return { ...shared, type: "manualAsset", valueAud: parseNumber(draft.assetValueAud) };
    case "etf":
      return {
        ...shared,
        type: "etf",
        ticker: draft.ticker.trim().toUpperCase(),
        units: parseNumber(draft.units),
        market: draft.market.trim().toUpperCase(),
      };
    case "crypto":
      return {
        ...shared,
        type: "crypto",
        symbol: draft.symbol.trim(),
        amount: parseNumber(draft.cryptoAmount),
      };
  }
}

export function makeHoldingDraftFromExisting(holding: Holding): HoldingDraft {
  switch (holding.type) {
    case "cash":
    case "debt":
      return {
        id: holding.id,
        createdAt: holding.createdAt,
        type: holding.type,
        name: holding.name,
        amountAud: String(holding.amountAud),
        notes: holding.notes ?? "",
        ticker: "",
        units: "",
        market: "ASX",
        symbol: "",
        cryptoAmount: "",
        assetValueAud: "",
      };
    case "manualAsset":
      return {
        id: holding.id,
        createdAt: holding.createdAt,
        type: "manualAsset",
        name: holding.name,
        amountAud: "",
        notes: holding.notes ?? "",
        ticker: "",
        units: "",
        market: "ASX",
        symbol: "",
        cryptoAmount: "",
        assetValueAud: String(holding.valueAud),
      };
    case "etf":
      return {
        id: holding.id,
        createdAt: holding.createdAt,
        type: "etf",
        name: holding.name,
        amountAud: "",
        notes: holding.notes ?? "",
        ticker: holding.ticker,
        units: String(holding.units),
        market: holding.market ?? "",
        symbol: "",
        cryptoAmount: "",
        assetValueAud: "",
      };
    case "crypto":
      return {
        id: holding.id,
        createdAt: holding.createdAt,
        type: "crypto",
        name: holding.name,
        amountAud: "",
        notes: holding.notes ?? "",
        ticker: "",
        units: "",
        market: "ASX",
        symbol: holding.symbol,
        cryptoAmount: String(holding.amount),
        assetValueAud: "",
      };
  }
}

function resolvePrice(holding: Holding, prices: PriceMap) {
  if (holding.type === "cash") {
    return {
      valueAud: holding.amountAud,
      priceLabel: "Cash balance",
      priceStatus: "ok" as const,
      statusLabel: "Manual balance",
      error: null,
    };
  }

  if (holding.type === "debt") {
    return {
      valueAud: holding.amountAud,
      priceLabel: "Debt balance",
      priceStatus: "ok" as const,
      statusLabel: "Manual balance",
      error: null,
    };
  }

  if (holding.type === "manualAsset") {
    return {
      valueAud: holding.valueAud,
      priceLabel: "Manual asset value",
      priceStatus: "ok" as const,
      statusLabel: "Manual value",
      error: null,
    };
  }

  const price = prices[holding.id] ?? null;
  const quantity = holding.type === "etf" ? holding.units : holding.amount;

  if (!price || price.unitPriceAud === null) {
    const symbol =
      holding.type === "etf"
        ? `${holding.ticker}${holding.market?.toUpperCase() === "ASX" ? ".AX" : ""}`
        : holding.symbol.toUpperCase();
    return {
      valueAud: 0,
      priceLabel: "No live price available yet",
      priceStatus: "error" as const,
      statusLabel: "Unavailable",
      error: price?.error ?? `Could not fetch live price for ${symbol}.`,
    };
  }

  const mappedStatus: ValuedHolding["priceStatus"] =
    price.status === "error" ? "error" : price.status === "stale" ? "stale" : price.status === "delayed" ? "fallback" : "ok";

  return {
    valueAud: quantity * price.unitPriceAud,
    priceLabel: `${formatPriceLabel(price.unitPriceAud)}${price.source ? ` • ${formatSourceLabel(price.source, price.statusText, price.detailText)}` : ""}`,
    priceStatus: mappedStatus,
    statusLabel:
      price.status === "mock"
        ? "Demo"
        : price.status === "stale"
          ? "Stale"
          : price.status === "delayed"
            ? "Fallback"
            : "Live",
    error: price.error ?? null,
  };
}

export function calculatePortfolioView(holdings: Holding[], prices: PriceMap, snapshots: PortfolioSnapshot[]): PortfolioView {
  const valuedHoldings: ValuedHolding[] = holdings.map((holding) => {
    const pricing = resolvePrice(holding, prices);
    const quantity =
      holding.type === "cash" || holding.type === "debt"
        ? holding.amountAud
        : holding.type === "etf"
          ? holding.units
          : holding.type === "crypto"
            ? holding.amount
            : holding.valueAud;

    return {
      ...pricing,
      id: holding.id,
      raw: holding,
      name: holding.name,
      type: holding.type,
      notes: holding.notes ?? "",
      badge:
        holding.type === "etf"
          ? `${holding.ticker}${holding.market ? ` • ${holding.market}` : ""}`
          : holding.type === "crypto"
            ? holding.symbol.toUpperCase()
            : holding.type === "manualAsset"
              ? "Manual"
              : null,
      subtitle:
        holding.type === "cash"
          ? "Cash account"
          : holding.type === "debt"
            ? "Debt balance"
            : holding.type === "etf"
              ? "Exchange-traded fund"
              : holding.type === "crypto"
                ? "Digital asset"
                : "Personal asset",
      quantityLabel:
        holding.type === "cash" || holding.type === "debt"
          ? formatAud(quantity)
          : holding.type === "manualAsset"
            ? formatAud(quantity)
            : `${formatQuantity(quantity, holding.type)} ${holding.type === "etf" ? "units" : holding.symbol.toUpperCase()}`,
    };
  });

  const totals = {
    cash: valuedHoldings.filter((holding) => holding.type === "cash").reduce((sum, holding) => sum + holding.valueAud, 0),
    etf: valuedHoldings.filter((holding) => holding.type === "etf").reduce((sum, holding) => sum + holding.valueAud, 0),
    crypto: valuedHoldings.filter((holding) => holding.type === "crypto").reduce((sum, holding) => sum + holding.valueAud, 0),
    debt: valuedHoldings.filter((holding) => holding.type === "debt").reduce((sum, holding) => sum + holding.valueAud, 0),
    manualAsset: valuedHoldings.filter((holding) => holding.type === "manualAsset").reduce((sum, holding) => sum + holding.valueAud, 0),
  };

  return {
    holdings: valuedHoldings,
    latestSnapshot: snapshots[snapshots.length - 1] ?? null,
    totals: {
      liquid: totals.cash + totals.etf + totals.crypto,
      ...totals,
      netWorth: totals.cash + totals.etf + totals.crypto + totals.manualAsset - totals.debt,
    },
  };
}

export function createSnapshot(holdings: ValuedHolding[], timestamp: string): PortfolioSnapshot {
  const totalCash = holdings.filter((holding) => holding.type === "cash").reduce((sum, holding) => sum + holding.valueAud, 0);
  const totalEtfValue = holdings.filter((holding) => holding.type === "etf").reduce((sum, holding) => sum + holding.valueAud, 0);
  const totalCryptoValue = holdings.filter((holding) => holding.type === "crypto").reduce((sum, holding) => sum + holding.valueAud, 0);
  const totalDebtValue = holdings.filter((holding) => holding.type === "debt").reduce((sum, holding) => sum + holding.valueAud, 0);
  const totalManualAssetValue = holdings.filter((holding) => holding.type === "manualAsset").reduce((sum, holding) => sum + holding.valueAud, 0);
  const failedHoldings = holdings.filter((holding) => holding.priceStatus === "error" || holding.priceStatus === "stale").length;

  return {
    id: randomId("snapshot"),
    timestamp,
    totalNetWorth: totalCash + totalEtfValue + totalCryptoValue + totalManualAssetValue - totalDebtValue,
    totalLiquidValue: totalCash + totalEtfValue + totalCryptoValue,
    totalCash,
    totalEtfValue,
    totalCryptoValue,
    totalDebtValue,
    status: failedHoldings ? "partial" : "success",
    failedHoldings,
  };
}

export function makePriceRequestItems(holdings: Holding[]): PriceRequestItem[] {
  return holdings.reduce<PriceRequestItem[]>((items, holding) => {
    if (holding.type === "etf") {
      items.push({
        holdingId: holding.id,
        kind: "etf",
        symbol: holding.ticker,
        market: holding.market,
      });
      return items;
    }

    if (holding.type === "crypto") {
      items.push({
        holdingId: holding.id,
        kind: "crypto",
        symbol: holding.symbol,
      });
    }

    return items;
  }, []);
}

export function deriveDisplayPrices(previous: PriceMap, results: PriceRequestResult[]): PriceMap {
  const next = { ...previous };

  results.forEach((result) => {
    const existing = previous[result.holdingId];

    if (result.status === "error" && existing?.unitPriceAud !== null) {
      next[result.holdingId] = {
        ...existing,
        status: "stale",
        statusText: "Saved last price",
        detailText: "Latest refresh failed",
        error: result.error ?? "Using last saved price from the previous refresh.",
      };
      return;
    }

    next[result.holdingId] = {
      holdingId: result.holdingId,
      assetType: result.kind,
      unitPriceAud: result.unitPriceAud,
      source: result.source,
      fetchedAt: result.fetchedAt,
      status: result.status,
      error: result.error,
      symbol: result.symbol,
      quoteCurrency: result.quoteCurrency,
      originalUnitPrice: result.originalUnitPrice ?? null,
      statusText: result.statusText,
      detailText: result.detailText,
    };
  });

  return next;
}

export function calculateComparison(snapshots: PortfolioSnapshot[]) {
  if (!snapshots.length) {
    return null;
  }

  const current = snapshots[snapshots.length - 1];
  const previousSuccessful = [...snapshots.slice(0, -1)].reverse().find((snapshot) => snapshot.status === "success");

  if (!previousSuccessful) {
    return null;
  }

  const currentBase = current.totalLiquidValue ?? current.totalCash + current.totalEtfValue + current.totalCryptoValue;
  const previousBase =
    previousSuccessful.totalLiquidValue ??
    previousSuccessful.totalCash + previousSuccessful.totalEtfValue + previousSuccessful.totalCryptoValue;
  const amount = currentBase - previousBase;
  const percent = previousBase === 0 ? 0 : (amount / previousBase) * 100;

  return {
    amount: Math.abs(amount),
    percent: Math.abs(percent),
    direction: amount >= 0 ? ("up" as const) : ("down" as const),
  };
}

export function buildRefreshInsight(previousView: PortfolioView, nextView: PortfolioView): RefreshInsight | null {
  const categories = [
    { label: "ETFs", deltaAud: nextView.totals.etf - previousView.totals.etf },
    { label: "Crypto", deltaAud: nextView.totals.crypto - previousView.totals.crypto },
    { label: "Cash", deltaAud: nextView.totals.cash - previousView.totals.cash },
    { label: "Debts", deltaAud: nextView.totals.debt - previousView.totals.debt },
  ];

  const movers = nextView.holdings
    .map((holding) => {
      const previous = previousView.holdings.find((item) => item.id === holding.id);
      return {
        name: holding.name,
        deltaAud: holding.valueAud - (previous?.valueAud ?? 0),
        type: holding.type,
      };
    })
    .filter((item) => item.type === "etf" || item.type === "crypto")
    .filter((item) => Math.abs(item.deltaAud) > 0.009)
    .sort((left, right) => Math.abs(right.deltaAud) - Math.abs(left.deltaAud))
    .slice(0, 3)
    .map(({ name, deltaAud }) => ({ name, deltaAud }));

  if (!movers.length && categories.every((item) => Math.abs(item.deltaAud) < 0.009)) {
    return null;
  }

  return { categories, movers };
}

export function buildHoldingGroups(holdings: ValuedHolding[], filter: HoldingType | "all"): HoldingGroup[] {
  const order: HoldingType[] = ["cash", "etf", "crypto", "manualAsset", "debt"];
  return order
    .filter((type) => filter === "all" || type === filter)
    .map((type) => ({
      type,
      label: HOLDING_TYPE_LABELS[type],
      items: holdings.filter((holding) => holding.type === type),
    }))
    .filter((group) => group.items.length);
}

export function buildAllocationSegments(totals: PortfolioView["totals"] | null) {
  if (!totals) {
    return [
      { label: "Cash", value: 1, width: 20, tone: "cash" },
      { label: "ETF", value: 1, width: 20, tone: "etf" },
      { label: "Crypto", value: 1, width: 20, tone: "crypto" },
      { label: "Assets", value: 1, width: 20, tone: "manualAsset" },
      { label: "Debt", value: 1, width: 20, tone: "debt" },
    ] as const;
  }

  const total = totals.cash + totals.etf + totals.crypto + totals.manualAsset + totals.debt || 1;

  return [
    { label: "Cash", value: totals.cash, width: (totals.cash / total) * 100, tone: "cash" },
    { label: "ETF", value: totals.etf, width: (totals.etf / total) * 100, tone: "etf" },
    { label: "Crypto", value: totals.crypto, width: (totals.crypto / total) * 100, tone: "crypto" },
    { label: "Assets", value: totals.manualAsset, width: (totals.manualAsset / total) * 100, tone: "manualAsset" },
    { label: "Debt", value: totals.debt, width: (totals.debt / total) * 100, tone: "debt" },
  ] as const;
}

export function needsAttentionCount(holdings: ValuedHolding[]) {
  return holdings.filter((holding) => holding.priceStatus === "error" || holding.priceStatus === "stale").length;
}

export function validateIncomeDraft(draft: IncomeDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) {
    errors.push("Income name is required.");
  }
  if (parseNumber(draft.amount) <= 0) {
    errors.push("Income amount must be greater than zero.");
  }
  return errors;
}

export function buildIncomeFromDraft(draft: IncomeDraft): IncomeEntry {
  const timestamp = nowIso();
  return {
    id: draft.id ?? randomId("income"),
    name: draft.name.trim(),
    amount: parseNumber(draft.amount),
    frequency: draft.frequency,
    notes: draft.notes.trim(),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function makeIncomeDraftFromExisting(entry: IncomeEntry): IncomeDraft {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    name: entry.name,
    amount: String(entry.amount),
    frequency: entry.frequency,
    notes: entry.notes ?? "",
  };
}

export function validateExpenseDraft(draft: ExpenseDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) {
    errors.push("Expense name is required.");
  }
  if (parseNumber(draft.amount) <= 0) {
    errors.push("Expense amount must be greater than zero.");
  }
  return errors;
}

export function buildExpenseFromDraft(draft: ExpenseDraft): ExpenseEntry {
  const timestamp = nowIso();
  return {
    id: draft.id ?? randomId("expense"),
    name: draft.name.trim(),
    amount: parseNumber(draft.amount),
    notes: draft.notes.trim(),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function makeExpenseDraftFromExisting(entry: ExpenseEntry): ExpenseDraft {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    name: entry.name,
    amount: String(entry.amount),
    notes: entry.notes ?? "",
  };
}

export function validateBankHistoryDraft(draft: BankHistoryDraft) {
  const errors: string[] = [];
  if (!draft.month) {
    errors.push("Month is required.");
  }
  if (parseNumber(draft.endingBalanceAud) < 0) {
    errors.push("Ending bank balance cannot be negative.");
  }
  return errors;
}

export function buildBankHistoryEntryFromDraft(draft: BankHistoryDraft): BankHistoryEntry {
  const timestamp = nowIso();
  return {
    id: draft.id ?? randomId("bank-history"),
    name: monthLabelFromValue(draft.month),
    month: draft.month,
    endingBalanceAud: parseNumber(draft.endingBalanceAud),
    notes: draft.notes.trim(),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function makeBankHistoryDraftFromExisting(entry: BankHistoryEntry): BankHistoryDraft {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    month: entry.month,
    endingBalanceAud: String(entry.endingBalanceAud),
    notes: entry.notes ?? "",
  };
}

export function validateScenarioDraft(draft: ScenarioDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) {
    errors.push("Scenario name is required.");
  }
  if (
    parseNumber(draft.cashAdditionAud) <= 0 &&
    parseNumber(draft.debtReductionAud) <= 0 &&
    parseNumber(draft.assetSaleAud) <= 0
  ) {
    errors.push("Add at least one scenario change.");
  }
  return errors;
}

export function buildScenarioFromDraft(draft: ScenarioDraft): Scenario {
  const timestamp = nowIso();
  return {
    id: draft.id ?? randomId("scenario"),
    name: draft.name.trim(),
    cashAdditionAud: parseNumber(draft.cashAdditionAud),
    debtReductionAud: parseNumber(draft.debtReductionAud),
    assetSaleAud: parseNumber(draft.assetSaleAud),
    notes: draft.notes.trim(),
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function makeScenarioDraftFromExisting(entry: Scenario): ScenarioDraft {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    name: entry.name,
    cashAdditionAud: entry.cashAdditionAud ? String(entry.cashAdditionAud) : "",
    debtReductionAud: entry.debtReductionAud ? String(entry.debtReductionAud) : "",
    assetSaleAud: entry.assetSaleAud ? String(entry.assetSaleAud) : "",
    notes: entry.notes ?? "",
  };
}

export function toMonthlyIncomeAmount(entry: IncomeEntry) {
  switch (entry.frequency) {
    case "weekly":
      return (entry.amount * 52) / 12;
    case "fortnightly":
      return (entry.amount * 26) / 12;
    case "yearly":
      return entry.amount / 12;
    case "monthly":
      return entry.amount;
    case "oneOff":
      return 0;
  }
}

export function calculateCashflow(incomes: IncomeEntry[], expenses: ExpenseEntry[]): MonthlyCashflowSummary {
  const recurringIncome = incomes.reduce((sum, entry) => sum + toMonthlyIncomeAmount(entry), 0);
  const oneOffIncome = incomes
    .filter((entry) => entry.frequency === "oneOff")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyExpenses = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    recurringIncome,
    oneOffIncome,
    monthlyExpenses,
    monthlyNet: recurringIncome - monthlyExpenses,
  };
}

export function calculateRunway(balance: number, monthlyNet: number) {
  if (monthlyNet >= 0) {
    return null;
  }
  return balance <= 0 ? 0 : balance / Math.abs(monthlyNet);
}

export function buildProjection(balance: number, incomes: IncomeEntry[], expenses: ExpenseEntry[], months = 12): ProjectionSummary {
  const cashflow = calculateCashflow(incomes, expenses);
  let runningBalance = balance;
  const series = Array.from({ length: months }, (_, index) => {
    const oneOff = index === 0 ? cashflow.oneOffIncome : 0;
    const delta = cashflow.monthlyNet + oneOff;
    runningBalance += delta;
    return {
      label: monthLabel(index),
      monthIndex: index + 1,
      balance: runningBalance,
      delta,
    };
  });

  return {
    series,
    monthlyNet: cashflow.monthlyNet,
    monthlyExpenses: cashflow.monthlyExpenses,
    recurringIncome: cashflow.recurringIncome,
    oneOffIncome: cashflow.oneOffIncome,
    runwayMonths: calculateRunway(balance, cashflow.monthlyNet),
  };
}

function sortBankHistory(entries: BankHistoryEntry[]) {
  return [...entries].sort((left, right) => left.month.localeCompare(right.month));
}

export function buildBankTrend(entries: BankHistoryEntry[], currentBalance: number, range: BankTrendRange): BankTrendSummary {
  const sorted = sortBankHistory(entries).map((entry) => ({
    label: monthLabelFromValue(entry.month),
    value: entry.endingBalanceAud,
    dateLabel: entry.month,
  }));
  const currentMonth = monthValue(new Date());
  const currentPoint = {
    label: sorted.at(-1)?.dateLabel === currentMonth ? "Now" : monthLabelFromValue(currentMonth),
    value: currentBalance,
    dateLabel: currentMonth,
  };

  const basePoints =
    sorted.at(-1)?.dateLabel === currentMonth ? [...sorted.slice(0, -1), currentPoint] : [...sorted, currentPoint];

  const limit = range === "all" ? null : Number.parseInt(range.replace("m", ""), 10);
  const points = limit ? basePoints.slice(-limit) : basePoints;

  if (points.length <= 1) {
    return {
      points,
      changeAud: points.length ? 0 : null,
      averageMonthlyChangeAud: null,
    };
  }

  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const changeAud = last - first;

  return {
    points,
    changeAud,
    averageMonthlyChangeAud: changeAud / (points.length - 1),
  };
}

export function findBankBufferWarning(series: ProjectionPoint[], threshold = DEFAULT_BANK_SAFETY_BUFFER_AUD) {
  const below = series.find((point) => point.balance < threshold);
  if (!below) {
    return null;
  }

  return `Bank balance drops below the safety buffer (${formatAud(threshold)}) in ${below.label}.`;
}

export function applyScenario(baseNetWorth: number, scenario: Scenario) {
  return baseNetWorth + scenario.cashAdditionAud + scenario.debtReductionAud + scenario.assetSaleAud;
}

export function compareScenario(baseNetWorth: number, scenario: Scenario, incomes: IncomeEntry[], expenses: ExpenseEntry[]): ScenarioComparison {
  const currentProjection = buildProjection(baseNetWorth, incomes, expenses, 12);
  const scenarioNetWorth = applyScenario(baseNetWorth, scenario);
  const scenarioProjection = buildProjection(scenarioNetWorth, incomes, expenses, 12);
  const currentRunwayMonths = calculateRunway(baseNetWorth, currentProjection.monthlyNet);
  const scenarioRunwayMonths = calculateRunway(scenarioNetWorth, scenarioProjection.monthlyNet);

  return {
    scenarioNetWorth,
    deltaNetWorth: scenarioNetWorth - baseNetWorth,
    currentRunwayMonths,
    scenarioRunwayMonths,
    runwayDeltaMonths:
      currentRunwayMonths === null || scenarioRunwayMonths === null ? null : scenarioRunwayMonths - currentRunwayMonths,
    currentTwelveMonthBalance: currentProjection.series.at(-1)?.balance ?? baseNetWorth,
    scenarioTwelveMonthBalance: scenarioProjection.series.at(-1)?.balance ?? scenarioNetWorth,
    twelveMonthDelta: (scenarioProjection.series.at(-1)?.balance ?? scenarioNetWorth) - (currentProjection.series.at(-1)?.balance ?? baseNetWorth),
  };
}

export const emptyIncomeDraft = EMPTY_INCOME_VALUES;
export const emptyExpenseDraft = EMPTY_EXPENSE_VALUES;
export const emptyBankHistoryDraft = EMPTY_BANK_HISTORY_VALUES;
export const emptyScenarioDraft = EMPTY_SCENARIO_VALUES;
