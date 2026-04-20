import { STALE_AFTER_MS } from "@/lib/constants";
import { formatAud, formatRelativeTime, formatSignedAud, formatTimestamp } from "@/lib/format";
import { aggregateBankHistoryByMonth, buildBankTrend, calculateRunway } from "@/lib/portfolio";
import type {
  BankHistoryEntry,
  DashboardInsights,
  MonthlyCashflowSummary,
  PortfolioSnapshot,
  PortfolioView,
  RefreshInsight,
} from "@/lib/types";

interface DashboardInsightsInput {
  now: number;
  view: PortfolioView;
  snapshots: PortfolioSnapshot[];
  bankHistory: BankHistoryEntry[];
  cashflow: MonthlyCashflowSummary;
  refreshInsight: RefreshInsight | null;
  lastViewedAt: string | null;
  previousViewedAt: string | null;
  lastRefreshedAt: string | null;
  priceStatusLabel: string;
  bankBufferWarning: string | null;
}

function getGreeting(now: number) {
  const hour = new Date(now).getHours();
  if (hour < 12) {
    return "Good morning, Tim";
  }
  if (hour < 18) {
    return "Good afternoon, Tim";
  }
  return "Good evening, Tim";
}

function getLiquidValue(snapshot: PortfolioSnapshot) {
  return snapshot.totalLiquidValue ?? snapshot.totalCash + snapshot.totalEtfValue + snapshot.totalCryptoValue;
}

function findSnapshotOnOrBefore(snapshots: PortfolioSnapshot[], isoDate: string) {
  const target = new Date(isoDate).getTime();
  return [...snapshots]
    .reverse()
    .find((snapshot) => snapshot.status === "success" && new Date(snapshot.timestamp).getTime() <= target) ?? null;
}

function findSnapshotDaysAgo(snapshots: PortfolioSnapshot[], now: number, daysAgo: number) {
  const target = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return findSnapshotOnOrBefore(snapshots, target);
}

function monthValueForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compareTone(amount: number) {
  if (Math.abs(amount) < 0.01) {
    return "neutral" as const;
  }
  return amount > 0 ? ("positive" as const) : ("negative" as const);
}

function strongestChange(view: PortfolioView, baseline: PortfolioSnapshot | null) {
  if (!baseline) {
    return null;
  }

  const drivers = [
    { label: "ETF gains", delta: view.totals.etf - baseline.totalEtfValue },
    { label: "crypto moves", delta: view.totals.crypto - baseline.totalCryptoValue },
    { label: "bank cash changes", delta: view.totals.cash - baseline.totalCash },
  ].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const top = drivers[0];
  if (!top || Math.abs(top.delta) < 0.01) {
    return null;
  }

  return top;
}

function describeSinceLastCheck(input: DashboardInsightsInput, checkAt: string | null) {
  if (!checkAt) {
    return "This is your first briefing here, so Tim’s Dash will build stronger insights after a refresh and a little more history.";
  }

  const baseline = findSnapshotOnOrBefore(input.snapshots, checkAt);
  const relativeCheck = formatRelativeTime(checkAt);

  if (!baseline) {
    if (input.lastRefreshedAt && new Date(input.lastRefreshedAt).getTime() > new Date(checkAt).getTime()) {
      return `Since your last check ${relativeCheck}, prices were refreshed, but there is not enough earlier snapshot history yet to compare the move cleanly.`;
    }

    return `Since your last check ${relativeCheck}, there is not much new data to compare yet. A fresh refresh or more history will make this briefing sharper.`;
  }

  const liquidDelta = input.view.totals.liquid - getLiquidValue(baseline);
  const driver = strongestChange(input.view, baseline);
  const absolute = Math.abs(liquidDelta);

  if (absolute < 10) {
    if (driver && Math.abs(driver.delta) >= 10) {
      return `Since your last check ${relativeCheck}, liquid money is broadly unchanged overall, although ${driver.label} shifted by ${formatSignedAud(driver.delta)}.`;
    }

    return `Since your last check ${relativeCheck}, your liquid position is broadly unchanged.`;
  }

  const direction = liquidDelta > 0 ? "up" : "down";
  const driverText = driver ? `, mostly from ${driver.label}` : "";
  return `Since your last check ${relativeCheck}, liquid money is ${direction} ${formatAud(absolute)}${driverText}.`;
}

function buildComparisons(input: DashboardInsightsInput) {
  const items: DashboardInsights["comparisons"] = [];
  const weekSnapshot = findSnapshotDaysAgo(input.snapshots, input.now, 7);
  const monthSnapshot = findSnapshotDaysAgo(input.snapshots, input.now, 30);
  const threeMonthSnapshot = findSnapshotDaysAgo(input.snapshots, input.now, 90);
  const bankTrendThreeMonths = buildBankTrend(input.bankHistory, input.view.totals.cash, "3m");
  const currentRunway = calculateRunway(input.view.totals.liquid, input.cashflow.monthlyNet);
  const pastRunway = monthSnapshot ? calculateRunway(getLiquidValue(monthSnapshot), input.cashflow.monthlyNet) : null;

  if (weekSnapshot) {
    const delta = input.view.totals.liquid - getLiquidValue(weekSnapshot);
    items.push({
      id: "vs-week",
      tone: compareTone(delta),
      text:
        Math.abs(delta) < 10
          ? "Liquid money is roughly flat versus last week."
          : `Liquid money is ${delta > 0 ? "higher" : "lower"} than last week by ${formatAud(Math.abs(delta))}.`,
    });
  }

  if (input.bankHistory.length) {
    const currentMonth = monthValueForDate(new Date(input.now));
    const grouped = aggregateBankHistoryByMonth(input.bankHistory);
    const previousMonthPoint = [...grouped].reverse().find((entry) => entry.month < currentMonth) ?? null;
    if (previousMonthPoint) {
      const delta = input.view.totals.cash - previousMonthPoint.totalAud;
      items.push({
        id: "bank-vs-month",
        tone: compareTone(delta),
        text:
          Math.abs(delta) < 10
            ? "Bank cash is close to where it finished last month."
            : `Bank cash is ${delta > 0 ? "above" : "below"} last month by ${formatAud(Math.abs(delta))}.`,
      });
    }
  }

  if (threeMonthSnapshot) {
    const delta = input.view.totals.liquid - getLiquidValue(threeMonthSnapshot);
    items.push({
      id: "vs-three-months",
      tone: compareTone(delta),
      text:
        Math.abs(delta) < 10
          ? "Liquid money is close to where it was three months ago."
          : `Liquid money is ${delta > 0 ? "stronger" : "softer"} than three months ago by ${formatAud(Math.abs(delta))}.`,
    });
  }

  if (bankTrendThreeMonths.averageMonthlyChangeAud !== null) {
    const avg = bankTrendThreeMonths.averageMonthlyChangeAud;
    items.push({
      id: "bank-average",
      tone: compareTone(avg),
      text:
        Math.abs(avg) < 10
          ? "Average monthly bank change over three months is broadly flat."
          : `Average monthly bank change over three months is ${formatSignedAud(avg)}.`,
    });
  }

  if (currentRunway !== null && pastRunway !== null) {
    const delta = currentRunway - pastRunway;
    items.push({
      id: "runway",
      tone: compareTone(delta),
      text:
        Math.abs(delta) < 0.25
          ? "Runway is about the same as it was a month ago."
          : `Runway is ${delta > 0 ? "longer" : "shorter"} than a month ago by about ${Math.abs(delta).toFixed(1)} months.`,
    });
  }

  return items.slice(0, 4);
}

function buildChanges(input: DashboardInsightsInput) {
  const items: DashboardInsights["changes"] = [];

  if (input.refreshInsight) {
    input.refreshInsight.categories
      .filter((item) => Math.abs(item.deltaAud) >= 1)
      .slice(0, 3)
      .forEach((item) => {
        items.push({
          id: `refresh-${item.label.toLowerCase()}`,
          tone: compareTone(item.deltaAud),
          text: `${item.label} ${Math.abs(item.deltaAud) < 0.01 ? "were unchanged" : `${item.deltaAud > 0 ? "added" : "reduced"} ${formatAud(Math.abs(item.deltaAud))}`}.`,
        });
      });
  }

  items.push({
    id: "cashflow",
    tone: compareTone(input.cashflow.monthlyNet),
    text:
      input.cashflow.monthlyNet >= 0
        ? `Monthly cashflow is supportive at ${formatSignedAud(input.cashflow.monthlyNet)}.`
        : `Monthly cashflow is running at ${formatSignedAud(input.cashflow.monthlyNet)}, which leans on cash reserves.`,
  });

  if (!items.length) {
    items.push({
      id: "quiet",
      tone: "neutral",
      text: "Nothing major has shifted yet. The next refresh or bank update will make changes easier to attribute.",
    });
  }

  return items.slice(0, 4);
}

function buildWatchouts(input: DashboardInsightsInput) {
  const items: DashboardInsights["watchouts"] = [];
  const bankTrend = buildBankTrend(input.bankHistory, input.view.totals.cash, "3m");
  const currentMonth = monthValueForDate(new Date(input.now));
  const latestBankMonth = aggregateBankHistoryByMonth(input.bankHistory).at(-1)?.month ?? null;
  const priceStale =
    !input.lastRefreshedAt || input.now - new Date(input.lastRefreshedAt).getTime() > STALE_AFTER_MS;

  if (bankTrend.averageMonthlyChangeAud !== null && bankTrend.averageMonthlyChangeAud < -10) {
    items.push({
      id: "bank-trend-soft",
      tone: "warning",
      text: "Bank cash has been trending lower over the last three months.",
    });
  }

  if (input.cashflow.monthlyNet < 0) {
    items.push({
      id: "negative-cashflow",
      tone: "warning",
      text: "Monthly cashflow is negative, so runway depends on protecting liquid reserves.",
    });
  }

  if (input.bankBufferWarning) {
    items.push({
      id: "buffer-warning",
      tone: "warning",
      text: input.bankBufferWarning,
    });
  }

  if (latestBankMonth !== currentMonth) {
    items.push({
      id: "bank-history-stale",
      tone: "warning",
      text: "Bank history does not include this month yet, so cash comparisons may be partial.",
    });
  }

  if (priceStale) {
    items.push({
      id: "price-stale",
      tone: "warning",
      text: `Holdings are currently marked as ${input.priceStatusLabel.toLowerCase()}, so market comparisons may be conservative.`,
    });
  }

  if (!items.length) {
    items.push({
      id: "all-clear",
      tone: "positive",
      text: "Nothing urgent stands out right now. The picture looks steady.",
    });
  }

  return items.slice(0, 3);
}

function buildRecommendation(input: DashboardInsightsInput) {
  const grouped = aggregateBankHistoryByMonth(input.bankHistory);
  const latestBankMonth = grouped.at(-1)?.month ?? null;
  const currentMonth = monthValueForDate(new Date(input.now));

  if (!input.lastRefreshedAt || input.now - new Date(input.lastRefreshedAt).getTime() > STALE_AFTER_MS) {
    return "Refresh prices to bring the latest ETF and crypto moves into this briefing.";
  }

  if (latestBankMonth !== currentMonth) {
    return "Import your latest bank statement so this month’s cash picture is complete.";
  }

  if (input.cashflow.monthlyNet < 0) {
    return "Review this month’s spending and cash commitments while monthly cashflow is still negative.";
  }

  if (input.bankBufferWarning) {
    return "Check your safety buffer and bank-cash forward view before the projected dip gets closer.";
  }

  if (grouped.length < 3) {
    return "Add a little more bank history so the trend and runway comparisons become more reliable.";
  }

  return "A quick weekly refresh is enough for now. Your dashboard already has a solid picture to work from.";
}

function buildConfidence(input: DashboardInsightsInput): DashboardInsights["confidence"] {
  const reasons: string[] = [];
  let score = 0;
  const bankMonths = aggregateBankHistoryByMonth(input.bankHistory);
  const latestBankMonth = bankMonths.at(-1)?.month ?? null;
  const currentMonth = monthValueForDate(new Date(input.now));
  const refreshedRecently =
    Boolean(input.lastRefreshedAt) && input.now - new Date(input.lastRefreshedAt as string).getTime() <= STALE_AFTER_MS;

  if (refreshedRecently) {
    score += 1;
  } else {
    reasons.push("market prices are not recent");
  }

  if (latestBankMonth === currentMonth) {
    score += 1;
  } else {
    reasons.push("this month’s bank history is missing");
  }

  if (bankMonths.length >= 3) {
    score += 1;
  } else {
    reasons.push("bank trend history is still light");
  }

  if (input.snapshots.length >= 2) {
    score += 1;
  } else {
    reasons.push("refresh snapshot history is still short");
  }

  if (score >= 4) {
    return {
      level: "high",
      label: "High confidence",
      reason: "Recent bank and holdings data look current, so the briefing is working from a solid baseline.",
    };
  }

  if (score >= 2) {
    return {
      level: "medium",
      label: "Medium confidence",
      reason: `The picture is useful, but ${reasons[0] ?? "some recent data is still partial"}.`,
    };
  }

  return {
    level: "low",
    label: "Low confidence",
    reason: `Comparisons are partial because ${reasons.slice(0, 2).join(" and ") || "recent data is limited"}.`,
  };
}

export function buildDashboardInsights(input: DashboardInsightsInput): DashboardInsights {
  const checkAt = input.previousViewedAt ?? input.lastViewedAt;

  return {
    greeting: getGreeting(input.now),
    lastCheckLabel: checkAt ? `Last check ${formatRelativeTime(checkAt)} • ${formatTimestamp(checkAt)}` : null,
    sinceLastCheck: describeSinceLastCheck(input, checkAt),
    comparisons: buildComparisons(input),
    changes: buildChanges(input),
    watchouts: buildWatchouts(input),
    recommendation: buildRecommendation(input),
    confidence: buildConfidence(input),
  };
}
