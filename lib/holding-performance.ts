import type { HoldingPurchaseLot, HoldingType, PortfolioSnapshot, PortfolioView, ValuedHolding } from "@/lib/types";

export type HoldingPerformanceRange = "1m" | "2m" | "3m" | "6m" | "1y" | "all";

export interface HoldingPerformanceMover {
  name: string;
  deltaAud: number;
  percent: number | null;
}

export interface HoldingGroupPerformance {
  type: Extract<HoldingType, "etf" | "crypto">;
  label: string;
  currentValueAud: number;
  costBasisAud: number | null;
  costBasisCoverage: "full" | "partial" | "none";
  overallGainAud: number | null;
  overallGainPercent: number | null;
  periodLabel: string;
  periodBaselineLabel: string | null;
  periodChangeAud: number | null;
  periodChangePercent: number | null;
  periodSource: "purchaseLots" | "snapshots" | "none";
  bestPerformer: HoldingPerformanceMover | null;
  worstPerformer: HoldingPerformanceMover | null;
  note: string;
}

const RANGE_DAYS: Record<Exclude<HoldingPerformanceRange, "all">, number> = {
  "1m": 30,
  "2m": 60,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

const RANGE_LABELS: Record<HoldingPerformanceRange, string> = {
  "1m": "Last 1 month",
  "2m": "Last 2 months",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "1y": "Last year",
  all: "All saved history",
};

function snapshotGroupValue(snapshot: PortfolioSnapshot, type: "etf" | "crypto") {
  return type === "etf" ? snapshot.totalEtfValue : snapshot.totalCryptoValue;
}

function isUsableSnapshot(snapshot: PortfolioSnapshot, type: "etf" | "crypto") {
  return Number.isFinite(snapshotGroupValue(snapshot, type)) && new Date(snapshot.timestamp).toString() !== "Invalid Date";
}

function findBaselineSnapshot(snapshots: PortfolioSnapshot[], type: "etf" | "crypto", range: HoldingPerformanceRange, now: number) {
  const usable = snapshots.filter((snapshot) => isUsableSnapshot(snapshot, type));

  if (!usable.length) {
    return null;
  }

  if (range === "all") {
    return usable[0];
  }

  const target = now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return [...usable].reverse().find((snapshot) => new Date(snapshot.timestamp).getTime() <= target) ?? usable[0];
}

function costBasisFor(holding: ValuedHolding) {
  if (holding.type !== "etf" && holding.type !== "crypto") {
    return null;
  }

  const costBasis =
    holding.raw.type === "etf" || holding.raw.type === "crypto"
      ? holding.raw.purchaseLots?.reduce((sum, lot) => sum + lot.costAud, 0) || holding.raw.costBasisAud
      : null;
  return typeof costBasis === "number" && Number.isFinite(costBasis) && costBasis > 0 ? costBasis : null;
}

function quantityFor(holding: ValuedHolding) {
  if (holding.raw.type === "etf") {
    return holding.raw.units;
  }

  if (holding.raw.type === "crypto") {
    return holding.raw.amount;
  }

  return 0;
}

function purchaseLotsFor(holding: ValuedHolding) {
  return holding.raw.type === "etf" || holding.raw.type === "crypto" ? holding.raw.purchaseLots ?? [] : [];
}

function lotCurrentValue(holding: ValuedHolding, lot: HoldingPurchaseLot) {
  const quantity = quantityFor(holding);
  if (quantity <= 0) {
    return 0;
  }

  return holding.valueAud * Math.min(lot.quantity / quantity, 1);
}

function currentValueCoveredByCostBasis(holding: ValuedHolding) {
  const lots = purchaseLotsFor(holding);
  if (lots.length) {
    return lots.reduce((sum, lot) => sum + lotCurrentValue(holding, lot), 0);
  }

  return costBasisFor(holding) === null ? 0 : holding.valueAud;
}

function hasFullCostCoverage(holding: ValuedHolding) {
  const lots = purchaseLotsFor(holding);
  if (!lots.length) {
    return costBasisFor(holding) !== null;
  }

  const quantity = quantityFor(holding);
  const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  return quantity > 0 && lotQuantity >= quantity * 0.999;
}

function rangeStartFor(range: HoldingPerformanceRange, now: number) {
  if (range === "all") {
    return null;
  }

  return now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
}

function lotsInRange(holding: ValuedHolding, range: HoldingPerformanceRange, now: number) {
  const start = rangeStartFor(range, now);
  return purchaseLotsFor(holding).filter((lot) => {
    const purchasedAt = new Date(`${lot.date}T00:00:00`).getTime();
    return Number.isFinite(purchasedAt) && (start === null || purchasedAt >= start);
  });
}

function calculateLotPeriodPerformance(holdings: ValuedHolding[], range: HoldingPerformanceRange, now: number) {
  const holdingsWithLots = holdings.filter((holding) => purchaseLotsFor(holding).length);
  if (!holdingsWithLots.length) {
    return null;
  }

  const movers = holdingsWithLots
    .map<HoldingPerformanceMover | null>((holding) => {
      const lots = lotsInRange(holding, range, now);
      const costAud = lots.reduce((sum, lot) => sum + lot.costAud, 0);
      const currentValueAud = lots.reduce((sum, lot) => sum + lotCurrentValue(holding, lot), 0);

      if (costAud <= 0) {
        return null;
      }

      const deltaAud = currentValueAud - costAud;
      return {
        name: holding.name,
        deltaAud,
        percent: (deltaAud / costAud) * 100,
      } satisfies HoldingPerformanceMover;
    })
    .filter((item): item is HoldingPerformanceMover => item !== null)
    .sort((left, right) => right.deltaAud - left.deltaAud);

  const totalCostAud = holdingsWithLots.reduce(
    (sum, holding) => sum + lotsInRange(holding, range, now).reduce((lotSum, lot) => lotSum + lot.costAud, 0),
    0,
  );
  const totalCurrentValueAud = holdingsWithLots.reduce(
    (sum, holding) => sum + lotsInRange(holding, range, now).reduce((lotSum, lot) => lotSum + lotCurrentValue(holding, lot), 0),
    0,
  );

  if (totalCostAud <= 0) {
    return {
      changeAud: null,
      changePercent: null,
      best: null,
      worst: null,
      hasLots: true,
    };
  }

  const changeAud = totalCurrentValueAud - totalCostAud;
  return {
    changeAud,
    changePercent: (changeAud / totalCostAud) * 100,
    best: movers[0] ?? null,
    worst: movers[movers.length - 1] ?? null,
    hasLots: true,
  };
}

function getSnapshotHoldingValue(snapshot: PortfolioSnapshot, holdingId: string) {
  return snapshot.holdings?.find((holding) => holding.holdingId === holdingId)?.valueAud ?? null;
}

function calculateMovers(holdings: ValuedHolding[], baseline: PortfolioSnapshot | null) {
  if (!baseline?.holdings?.length) {
    return { best: null, worst: null };
  }

  const movers = holdings
    .map((holding) => {
      const previousValue = getSnapshotHoldingValue(baseline, holding.id);
      if (previousValue === null) {
        return null;
      }

      const deltaAud = holding.valueAud - previousValue;
      return {
        name: holding.name,
        deltaAud,
        percent: previousValue === 0 ? null : (deltaAud / previousValue) * 100,
      };
    })
    .filter((item): item is HoldingPerformanceMover => item !== null)
    .sort((left, right) => right.deltaAud - left.deltaAud);

  return {
    best: movers[0] ?? null,
    worst: movers[movers.length - 1] ?? null,
  };
}

export function buildHoldingPerformance(
  view: PortfolioView,
  snapshots: PortfolioSnapshot[],
  range: HoldingPerformanceRange,
  now = Date.now(),
): HoldingGroupPerformance[] {
  return [
    { type: "etf" as const, label: "ETF performance" },
    { type: "crypto" as const, label: "Crypto performance" },
  ].map(({ type, label }) => {
    const holdings = view.holdings.filter((holding) => holding.type === type);
    const currentValueAud = type === "etf" ? view.totals.etf : view.totals.crypto;
    const holdingsWithCostBasis = holdings.filter((holding) => costBasisFor(holding) !== null);
    const costBasisAud = holdingsWithCostBasis.reduce((sum, holding) => sum + (costBasisFor(holding) ?? 0), 0);
    const currentValueWithCostBasis = holdingsWithCostBasis.reduce((sum, holding) => sum + currentValueCoveredByCostBasis(holding), 0);
    const costBasisCoverage =
      holdingsWithCostBasis.length === 0
        ? "none"
        : holdingsWithCostBasis.length === holdings.length && holdingsWithCostBasis.every(hasFullCostCoverage)
          ? "full"
          : "partial";
    const overallGainAud = costBasisAud > 0 ? currentValueWithCostBasis - costBasisAud : null;
    const overallGainPercent = costBasisAud > 0 && overallGainAud !== null ? (overallGainAud / costBasisAud) * 100 : null;
    const baseline = findBaselineSnapshot(snapshots, type, range, now);
    const baselineValue = baseline ? snapshotGroupValue(baseline, type) : null;
    const snapshotPeriodChangeAud = baselineValue === null ? null : currentValueAud - baselineValue;
    const snapshotPeriodChangePercent =
      baselineValue && snapshotPeriodChangeAud !== null ? (snapshotPeriodChangeAud / baselineValue) * 100 : null;
    const snapshotMovers = calculateMovers(holdings, baseline);
    const lotPeriod = calculateLotPeriodPerformance(holdings, range, now);
    const periodSource = lotPeriod?.hasLots ? "purchaseLots" : baseline ? "snapshots" : "none";
    const periodChangeAud = lotPeriod?.hasLots ? lotPeriod.changeAud : snapshotPeriodChangeAud;
    const periodChangePercent = lotPeriod?.hasLots ? lotPeriod.changePercent : snapshotPeriodChangePercent;
    const bestPerformer = lotPeriod?.hasLots ? lotPeriod.best : snapshotMovers.best;
    const worstPerformer = lotPeriod?.hasLots ? lotPeriod.worst : snapshotMovers.worst;

    return {
      type,
      label,
      currentValueAud,
      costBasisAud: costBasisAud > 0 ? costBasisAud : null,
      costBasisCoverage,
      overallGainAud,
      overallGainPercent,
      periodLabel: RANGE_LABELS[range],
      periodBaselineLabel: baseline ? baseline.timestamp : null,
      periodChangeAud,
      periodChangePercent,
      periodSource,
      bestPerformer,
      worstPerformer,
      note:
        costBasisCoverage === "none"
          ? "Add purchase history or total invested amounts to see overall gain or loss."
          : costBasisCoverage === "partial"
            ? "Overall gain/loss only includes holdings with a total invested amount."
            : periodSource === "purchaseLots"
              ? "The selected period shows gain/loss on purchases made inside that range."
              : baseline?.holdings?.length
                ? "Period winners use saved per-holding snapshot values."
                : "Period totals use saved snapshots. Add purchase history for range results by buy date.",
    };
  });
}
