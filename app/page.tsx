"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Coins,
  History,
  Landmark,
  LayoutGrid,
  LoaderCircle,
  Moon,
  Pencil,
  PieChart,
  Plus,
  RefreshCcw,
  SunMedium,
  TrendingUp,
  Trash2,
  Wallet,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { BankHistoryForm } from "@/components/bank-history-form";
import { CashflowForm } from "@/components/cashflow-form";
import { HoldingForm } from "@/components/holding-form";
import { ProjectionChart } from "@/components/projection-chart";
import { TrendChart } from "@/components/trend-chart";
import { parseUbankPdfText } from "@/lib/importers/ubank-pdf";
import { parseUbankCsv } from "@/lib/importers/ubank";
import { buildDashboardInsights } from "@/lib/insights";
import {
  DEFAULT_BANK_SAFETY_BUFFER_AUD,
  EMPTY_BANK_HISTORY_VALUES,
  EMPTY_EXPENSE_VALUES,
  EMPTY_FORM_VALUES,
  EMPTY_INCOME_VALUES,
  FILTER_OPTIONS,
  HOLDING_TYPE_LABELS,
  SAMPLE_HOLDINGS,
  STALE_AFTER_MS,
} from "@/lib/constants";
import {
  aggregateBankHistoryByMonth,
  buildAllocationSegments,
  buildBankTrend,
  buildHoldingGroups,
  buildProjection,
  calculateCashflow,
  calculateComparison,
  calculatePortfolioView,
  findBankBufferWarning,
  makeBankHistoryDraftFromExisting,
  makeExpenseDraftFromExisting,
  makeHoldingDraftFromExisting,
  makeIncomeDraftFromExisting,
  needsAttentionCount,
} from "@/lib/portfolio";
import { usePortfolioApp } from "@/hooks/use-portfolio-app";
import { formatAud, formatMonths, formatPercent, formatRelativeTime, formatSignedAud, formatTimestamp } from "@/lib/format";
import type {
  BankHistoryDraft,
  BankProjectionMode,
  BankTrendRange,
  ExpenseDraft,
  HoldingDraft,
  HoldingType,
  IncomeDraft,
  PortfolioSnapshot,
  UbankImportBatchItem,
} from "@/lib/types";

type TabId = "dashboard" | "holdings" | "cashflow" | "projections" | "history";
type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "tims-dash-theme";

const sectionIcons = {
  cash: Banknote,
  etf: Landmark,
  crypto: Coins,
  debt: CircleDollarSign,
  manualAsset: Wallet,
} satisfies Record<HoldingType, typeof Banknote>;

const tabs: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "holdings", label: "Holdings", icon: Wallet },
  { id: "cashflow", label: "Income & Expenses", icon: Banknote },
  { id: "projections", label: "Projections", icon: TrendingUp },
  { id: "history", label: "History", icon: History },
];

const forwardModes: { id: BankProjectionMode; label: string }[] = [
  { id: "liquid", label: "Liquid View" },
  { id: "bankCash", label: "Bank Cash View" },
];

const bankRangeOptions: { id: BankTrendRange; label: string }[] = [
  { id: "3m", label: "3m" },
  { id: "6m", label: "6m" },
  { id: "12m", label: "12m" },
  { id: "all", label: "All" },
];

function getSnapshotLiquidValue(snapshot: PortfolioSnapshot) {
  return snapshot.totalLiquidValue ?? snapshot.totalCash + snapshot.totalEtfValue + snapshot.totalCryptoValue;
}

function describeDelta(label: string, deltaAud: number) {
  if (Math.abs(deltaAud) < 0.005) {
    return `${label} unchanged`;
  }

  return `${label} ${deltaAud > 0 ? "increased" : "decreased"} by ${formatAud(Math.abs(deltaAud))}`;
}

function rangeLabel(range: BankTrendRange) {
  switch (range) {
    case "3m":
      return "last 3 months";
    case "6m":
      return "last 6 months";
    case "12m":
      return "last 12 months";
    case "all":
      return "all available history";
  }
}

function monthNameFromValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function buildBankHistoryAccountDuplicateKey(accountName: string | null | undefined, accountId: string | null | undefined, month: string, endingBalanceAud: number) {
  return `${accountName?.trim().toLowerCase() ?? ""}|${accountId?.trim().toLowerCase() ?? ""}|${month}|${endingBalanceAud.toFixed(2)}`;
}

function buildBankHistoryAccountMonthKey(accountName: string | null | undefined, accountId: string | null | undefined, month: string) {
  return `${accountName?.trim().toLowerCase() ?? ""}|${accountId?.trim().toLowerCase() ?? ""}|${month}`;
}

function describeImportSelection(items: UbankImportBatchItem[]) {
  const selected = items.length;
  const ready = items.filter((item) => item.status === "ready").length;
  const needsInput = items.filter((item) => item.status === "needs_input").length;
  const duplicates = items.filter((item) => item.status === "duplicate").length;
  const errors = items.filter((item) => item.status === "error").length;
  return `${selected} file${selected === 1 ? "" : "s"} selected • ${ready} ready • ${needsInput} need balance • ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped • ${errors} parse error${errors === 1 ? "" : "s"}`;
}

export default function HomePage() {
  const {
    holdings,
    prices,
    snapshots,
    incomes,
    expenses,
    bankHistory,
    refreshState,
    lastRefreshedAt,
    refreshPortfolio,
    saveHolding,
    deleteHolding,
    saveIncome,
    deleteIncome,
    saveExpense,
    deleteExpense,
    saveBankHistoryEntry,
    deleteBankHistoryEntry,
    deleteSnapshot,
    clearSnapshots,
    loadSampleData,
    clearDemoMessage,
    lastError,
    demoMessage,
    refreshSummary,
    refreshInsight,
    lastViewedAt,
    previousViewedAt,
    hasSupabase,
    isSignedIn,
    authReady,
    userEmail,
    authMessage,
    syncError,
    showImportPrompt,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    importLocalToCloud,
    startFreshCloud,
    markDashboardViewed,
  } = usePortfolioApp();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [filter, setFilter] = useState<HoldingType | "all">("all");
  const [draft, setDraft] = useState<HoldingDraft | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [bankHistoryDraft, setBankHistoryDraft] = useState<BankHistoryDraft | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [forwardMode, setForwardMode] = useState<BankProjectionMode>("liquid");
  const [bankTrendRange, setBankTrendRange] = useState<BankTrendRange>("6m");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const rootTheme = document.documentElement.dataset.theme;
      if (rootTheme === "light" || rootTheme === "dark") {
        return rootTheme;
      }
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  });
  const [ubankImportItems, setUbankImportItems] = useState<UbankImportBatchItem[]>([]);
  const [ubankImportError, setUbankImportError] = useState<string | null>(null);
  const [ubankImportMessage, setUbankImportMessage] = useState<string | null>(null);
  const [ubankDragActive, setUbankDragActive] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage failures and keep the in-memory theme selection.
    }
  };

  const handleUbankCsvUpload = async (files: FileList | File[] | null) => {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) {
      return;
    }

    setUbankImportError(null);
    setUbankImportMessage(null);

    const existingHistoryKeys = new Set(
      bankHistory.map((entry) =>
        buildBankHistoryAccountDuplicateKey(entry.accountName, entry.accountId, entry.month, entry.endingBalanceAud),
      ),
    );
    const existingAccountMonthKeys = new Set(
      bankHistory.map((entry) => buildBankHistoryAccountMonthKey(entry.accountName, entry.accountId, entry.month)),
    );
    const seenBatchSignatures = new Set<string>();
    const seenFingerprints = new Set<string>();
    const seenBatchAccountMonths = new Set<string>();

    const nextItems = await Promise.all(
      selectedFiles.map(async (file) => {
        const extension = file.name.toLowerCase();
        if (!extension.endsWith(".csv") && !extension.endsWith(".pdf")) {
          return {
            id: `ubank-import-${Math.random().toString(36).slice(2, 10)}`,
            fileName: file.name,
            status: "error" as const,
            review: null,
            error: "Only Ubank CSV or PDF statement files are supported in this import.",
            duplicateReason: null,
          };
        }

        try {
          const review = extension.endsWith(".pdf")
            ? await (async () => {
                const formData = new FormData();
                formData.append("file", file);
                const response = await fetch("/api/parse-statement", {
                  method: "POST",
                  body: formData,
                });
                const payload = (await response.json()) as { review?: Awaited<ReturnType<typeof parseUbankPdfText>>; error?: string };
                if (!response.ok || !payload.review) {
                  throw new Error(payload.error ?? "We could not read that PDF statement.");
                }
                return payload.review;
              })()
            : parseUbankCsv(await file.text(), file.name);
          const accountMonthKey = buildBankHistoryAccountMonthKey(review.accountName, review.accountId, review.detectedMonth);
          const bankHistoryKey =
            review.endingBalanceAud === null
              ? null
              : buildBankHistoryAccountDuplicateKey(review.accountName, review.accountId, review.detectedMonth, review.endingBalanceAud);
          let status: UbankImportBatchItem["status"] = review.manualBalanceRequired ? "needs_input" : "ready";
          let duplicateReason: string | null = null;

          if ((bankHistoryKey && existingHistoryKeys.has(bankHistoryKey)) || (review.manualBalanceRequired && existingAccountMonthKeys.has(accountMonthKey))) {
            status = "duplicate";
            duplicateReason = review.manualBalanceRequired
              ? "Already imported for the same account and month."
              : "Already imported for the same account, month, and ending balance.";
          } else if (seenFingerprints.has(review.fileFingerprint) || seenBatchSignatures.has(review.statementSignature) || (review.manualBalanceRequired && seenBatchAccountMonths.has(accountMonthKey))) {
            status = "duplicate";
            duplicateReason = "Duplicate of another statement in this upload batch.";
          }

          seenFingerprints.add(review.fileFingerprint);
          seenBatchSignatures.add(review.statementSignature);
          seenBatchAccountMonths.add(accountMonthKey);

          return {
            id: `ubank-import-${Math.random().toString(36).slice(2, 10)}`,
            fileName: file.name,
            status,
            review,
            error: null,
            duplicateReason,
            manualBalanceAud: review.endingBalanceAud === null ? "" : undefined,
          };
        } catch (error) {
          return {
            id: `ubank-import-${Math.random().toString(36).slice(2, 10)}`,
            fileName: file.name,
            status: "error" as const,
            review: null,
            error: error instanceof Error ? error.message : "We could not read that CSV file.",
            duplicateReason: null,
          };
        }
      }),
    );

    setUbankImportItems(nextItems);
    setUbankImportMessage(describeImportSelection(nextItems));
  };

  const saveImportedBankHistory = () => {
    const readyItems = ubankImportItems.filter(
      (item) =>
        item.review &&
        (item.status === "ready" || (item.status === "needs_input" && Number(item.manualBalanceAud) > 0)),
    );
    if (!readyItems.length) {
      setUbankImportError("There are no valid new statements ready to import yet.");
      return;
    }

    readyItems.forEach((item) => {
      if (!item.review) {
        return;
      }

      const endingBalanceAud = item.review.endingBalanceAud ?? Number(item.manualBalanceAud);

      saveBankHistoryEntry({
        id: `bank-history-${Math.random().toString(36).slice(2, 10)}`,
        name: monthNameFromValue(item.review.detectedMonth),
        month: item.review.detectedMonth,
        endingBalanceAud,
        accountName: item.review.accountName ?? "Bank account",
        accountId: item.review.accountId ?? "",
        notes: item.review.accountName
          ? item.review.manualBalanceRequired
            ? `Imported from ${item.review.accountName} with manual ending balance`
            : `Imported from ${item.review.accountName}`
          : "Imported from Ubank CSV",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const duplicates = ubankImportItems.filter((item) => item.status === "duplicate").length;
    const errors = ubankImportItems.filter((item) => item.status === "error").length;
    setUbankImportMessage(
      `${readyItems.length} imported • ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped • ${errors} parse error${errors === 1 ? "" : "s"}`,
    );
    setUbankImportItems([]);
    setUbankImportError(null);
  };

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const view = useMemo(() => calculatePortfolioView(holdings, prices, snapshots), [holdings, prices, snapshots]);
  const grouped = useMemo(() => buildHoldingGroups(view.holdings, filter), [filter, view.holdings]);
  const comparison = useMemo(() => calculateComparison(snapshots), [snapshots]);
  const cashflow = useMemo(() => calculateCashflow(incomes, expenses), [incomes, expenses]);
  const liquidProjection = useMemo(() => buildProjection(view.totals.liquid, incomes, expenses, 12), [view.totals.liquid, incomes, expenses]);
  const bankProjection = useMemo(() => buildProjection(view.totals.cash, incomes, expenses, 12), [view.totals.cash, incomes, expenses]);
  const selectedProjection = forwardMode === "liquid" ? liquidProjection : bankProjection;
  const threeMonthProjection = selectedProjection.series.slice(0, 3);
  const groupedBankHistory = useMemo(() => aggregateBankHistoryByMonth(bankHistory), [bankHistory]);
  const bankTrend = useMemo(() => buildBankTrend(bankHistory, view.totals.cash, bankTrendRange), [bankHistory, view.totals.cash, bankTrendRange]);
  const bankBufferWarning = useMemo(() => findBankBufferWarning(bankProjection.series, DEFAULT_BANK_SAFETY_BUFFER_AUD), [bankProjection.series]);
  const stale = lastRefreshedAt ? currentTime - new Date(lastRefreshedAt).getTime() > STALE_AFTER_MS : true;
  const attentionCount = needsAttentionCount(view.holdings);
  const allocation = buildAllocationSegments(view.totals);
  const hasSavedPrices = Object.values(prices).some((price) => price.status === "stale");
  const priceStatusLabel = !lastRefreshedAt
    ? "Needs refresh"
    : hasSavedPrices
      ? "Using saved prices"
      : stale
        ? "Price data may be stale"
        : currentTime - new Date(lastRefreshedAt).getTime() < 5 * 60 * 1000
          ? "Live"
          : "Recently updated";
  const insights = useMemo(
    () =>
      buildDashboardInsights({
        now: currentTime,
        view,
        snapshots,
        bankHistory,
        cashflow,
        refreshInsight,
        lastViewedAt,
        previousViewedAt,
        lastRefreshedAt,
        priceStatusLabel,
        bankBufferWarning,
      }),
    [
      currentTime,
      view,
      snapshots,
      bankHistory,
      cashflow,
      refreshInsight,
      lastViewedAt,
      previousViewedAt,
      lastRefreshedAt,
      priceStatusLabel,
      bankBufferWarning,
    ],
  );

  useEffect(() => {
    if (activeTab === "dashboard") {
      markDashboardViewed();
    }
  }, [activeTab, markDashboardViewed]);

  const allocationGradient = useMemo(() => {
    const colors: Record<string, string> = {
      cash: "#8fe5c0",
      etf: "#6ba6ff",
      crypto: "#f4c572",
      manualAsset: "#d6c7ff",
      debt: "#ff7d7d",
    };

    const stops = allocation.reduce<{ current: number; parts: string[] }>(
      (accumulator, segment) => {
        const start = accumulator.current;
        const end = start + segment.width;
        return {
          current: end,
          parts: [...accumulator.parts, `${colors[segment.tone]} ${start}% ${end}%`],
        };
      },
      { current: 0, parts: [] },
    );

    return `conic-gradient(${stops.parts.join(", ")})`;
  }, [allocation]);

  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Dashboard";

  return (
    <main className="app-shell">
      <div className="app-backdrop" />
      <div className="app-frame">
        <div className="app-layout">
          <aside className="side-nav surface">
            <div className="side-nav-top">
              <div className="brand-mark" aria-hidden="true">
                <span>T</span>
              </div>
              <div className="side-nav-copy">
                <p className="eyebrow">Private Finance</p>
                <h1>Tim&apos;s Dash</h1>
              </div>
            </div>

            <nav className="tab-bar side-tab-bar" aria-label="Sections">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={clsx("tab-button", activeTab === tab.id && "active")}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="side-nav-bottom">
              <button
                className="theme-toggle sidebar-theme-toggle"
                onClick={toggleTheme}
                type="button"
                aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
              >
                <span className="theme-toggle-icon">{themeMode === "dark" ? <SunMedium size={16} /> : <Moon size={16} />}</span>
                <span className="theme-toggle-copy">
                  <strong>{themeMode === "dark" ? "Dark mode" : "Light mode"}</strong>
                  <small>{themeMode === "dark" ? "Soft contrast" : "Pale canvas"}</small>
                </span>
              </button>

              <div className="side-sync-card inset-surface">
                <p className="eyebrow">Sync</p>
                <strong>{hasSupabase ? (isSignedIn ? "Cloud connected" : "Private sync ready") : "Local only"}</strong>
                <span className="subtle">
                  {hasSupabase ? (isSignedIn ? userEmail ?? "Signed in" : "Sign in to sync across devices.") : "Supabase env vars are not configured."}
                </span>
                {hasSupabase ? (
                  isSignedIn ? (
                    <button className="secondary-button full-width" onClick={() => void signOut()} type="button">
                      Sign out
                    </button>
                  ) : (
                    <button className="secondary-button full-width" onClick={() => setShowAuthModal(true)} type="button" disabled={!authReady}>
                      Sign in for sync
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </aside>

          <section className="workspace-shell">
            <header className="workspace-topbar surface">
              <div className="workspace-topbar-actions">
                <button className="secondary-button" onClick={() => loadSampleData(SAMPLE_HOLDINGS)} type="button">
                  Load sample data
                </button>
                <button
                  className={clsx("primary-button", refreshState === "loading" && "is-loading")}
                  onClick={() => void refreshPortfolio()}
                  type="button"
                  disabled={refreshState === "loading"}
                >
                  {refreshState === "loading" ? <LoaderCircle className="spin" size={18} /> : <RefreshCcw size={18} />}
                  Refresh
                </button>
              </div>
            </header>

            <section className="workspace-intro surface">
              <div>
                <p className="eyebrow">Overview</p>
                <h2>{activeTabLabel}</h2>
                <p className="subtle">
                  Liquid money, live ETF and crypto pricing, and a clearer forward view of your bank cash in AUD.
                </p>
              </div>
              <div className="workspace-intro-meta">
                <div className="workspace-intro-pill inset-surface">
                  <span>Pricing status</span>
                  <strong>{priceStatusLabel}</strong>
                </div>
                <div className="workspace-intro-pill inset-surface">
                  <span>Refresh result</span>
                  <strong>{refreshSummary ? `${refreshSummary.updated} updated • ${refreshSummary.failed} failed` : "No refresh yet"}</strong>
                </div>
              </div>
            </section>

            {hasSupabase && !isSignedIn ? (
              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Private Sync</p>
                    <h2>Sign in for sync across devices</h2>
                  </div>
                </div>
                <p className="subtle">Use your email and password to keep your dashboard private and synced between devices. You stay signed in until you sign out.</p>
              </section>
            ) : null}

            {showImportPrompt ? (
              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Cloud Setup</p>
                    <h2>Bring your existing data with you?</h2>
                  </div>
                </div>
                <p className="subtle">We found local data on this device. Import it into your private Supabase account, or start with a clean synced dashboard.</p>
                <div className="section-actions">
                  <button className="secondary-button" onClick={() => void startFreshCloud()} type="button">
                    Start fresh
                  </button>
                  <button className="primary-button" onClick={() => void importLocalToCloud()} type="button">
                    Import local data
                  </button>
                </div>
              </section>
            ) : null}

        {activeTab === "dashboard" ? (
          <section className="tab-panel dashboard-stack">
            <section className="hero-card surface">
              <div className="hero-copy">
                <div className="hero-label-row">
                  <span className="eyebrow">Usable Total</span>
                  <span
                    className={clsx(
                      "status-pill",
                      priceStatusLabel === "Live"
                        ? "ok"
                        : priceStatusLabel === "Needs refresh" || priceStatusLabel === "Price data may be stale" || priceStatusLabel === "Using saved prices"
                          ? "warning"
                          : "ok",
                    )}
                  >
                    {priceStatusLabel}
                  </span>
                </div>
                <div className={clsx("hero-figure", comparison?.direction)}>
                  <AnimatedNumber value={view.totals.liquid} format={formatAud} />
                </div>
                <p className="hero-support subtle">
                  Liquid money includes cash, ETFs, and crypto. Manual assets are shown separately and are excluded from forward planning.
                </p>
                <div className="hero-meta">
                  {comparison ? (
                    <div className={clsx("delta-card", comparison.direction)}>
                      {comparison.direction === "up" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                      <div>
                        <strong>{formatAud(comparison.amount)}</strong>
                        <span>{formatPercent(comparison.percent)} since previous successful refresh</span>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-inline">No previous refresh to compare.</p>
                  )}
                  <div className="stamp-stack">
                    <span>Last refreshed</span>
                    <strong>{lastRefreshedAt ? formatTimestamp(lastRefreshedAt) : "Not yet refreshed"}</strong>
                  </div>
                </div>
              </div>

              <div className="hero-side hero-side-grid">
                <MetricCard label="Bank cash" value={formatAud(view.totals.cash)} tone="neutral" />
                <MetricCard label="ETFs" value={formatAud(view.totals.etf)} tone="neutral" />
                <MetricCard label="Crypto" value={formatAud(view.totals.crypto)} tone="neutral" />
                <MetricCard label="Additional asset value" value={formatAud(view.totals.manualAsset)} tone="neutral" />
                <MetricCard label="Liabilities" value={formatAud(view.totals.debt)} tone="negative" />
                <MetricCard label="Net worth incl. assets" value={formatAud(view.totals.netWorth)} tone="neutral" />
              </div>
            </section>

            <section className="surface section-card insights-card">
              <div className="section-head compact insights-head">
                <div>
                  <p className="eyebrow">Insights</p>
                  <h2>{insights.greeting}</h2>
                </div>
                <span className={clsx("status-pill", insights.confidence.level === "high" ? "ok" : insights.confidence.level === "low" ? "warning" : "")}>
                  {insights.confidence.label}
                </span>
              </div>
              {insights.lastCheckLabel ? <p className="subtle insights-meta">{insights.lastCheckLabel}</p> : null}
              <p className="insights-summary">{insights.sinceLastCheck}</p>

              <div className="insights-grid">
                <article className="insight-section">
                  <span className="eyebrow">Compared with recent periods</span>
                  <div className="insight-list">
                    {insights.comparisons.map((item) => (
                      <p key={item.id} className={clsx("insight-line", item.tone && `tone-${item.tone}`)}>
                        {item.text}
                      </p>
                    ))}
                  </div>
                </article>

                <article className="insight-section">
                  <span className="eyebrow">What changed</span>
                  <div className="insight-list">
                    {insights.changes.map((item) => (
                      <p key={item.id} className={clsx("insight-line", item.tone && `tone-${item.tone}`)}>
                        {item.text}
                      </p>
                    ))}
                  </div>
                </article>

                <article className="insight-section">
                  <span className="eyebrow">Worth watching</span>
                  <div className="insight-list">
                    {insights.watchouts.map((item) => (
                      <p key={item.id} className={clsx("insight-line", item.tone && `tone-${item.tone}`)}>
                        {item.text}
                      </p>
                    ))}
                  </div>
                </article>

                <article className="insight-section insight-action">
                  <span className="eyebrow">Suggested next action</span>
                  <p className="insight-recommendation">{insights.recommendation}</p>
                  <p className="subtle">{insights.confidence.reason}</p>
                </article>
              </div>
            </section>

            <section className="dashboard-grid">
              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Forward View</p>
                    <h2>Next 3 months</h2>
                  </div>
                </div>
                <div className="segmented-control compact-toggle">
                  {forwardModes.map((mode) => (
                    <button
                      key={mode.id}
                      className={clsx(forwardMode === mode.id && "active")}
                      onClick={() => setForwardMode(mode.id)}
                      type="button"
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <p className="subtle">
                  {forwardMode === "liquid"
                    ? "Liquid View starts with cash, ETFs, and crypto, then applies income and expenses."
                    : "Bank Cash View starts with bank cash only, then applies income and expenses. ETFs and crypto are excluded."}
                </p>
                <div className="projection-list compact-list">
                  {threeMonthProjection.map((point) => (
                    <div key={`${forwardMode}-${point.label}`} className="projection-row">
                      <div>
                        <strong>{point.label}</strong>
                        <span>{formatSignedAud(point.delta)}</span>
                      </div>
                      <strong>{formatAud(point.balance)}</strong>
                    </div>
                  ))}
                </div>
                {forwardMode === "bankCash" && bankBufferWarning ? <div className="runway-banner warning-banner">{bankBufferWarning}</div> : null}
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Bank Trend</p>
                    <h2>Bank Balance Trend</h2>
                  </div>
                </div>
                <div className="section-actions">
                  <div className="segmented-control compact-toggle">
                    {bankRangeOptions.map((option) => (
                      <button
                        key={option.id}
                        className={clsx(bankTrendRange === option.id && "active")}
                        onClick={() => setBankTrendRange(option.id)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="metric-strip bank-trend-metrics">
                  <MetricCard label="Current bank balance" value={formatAud(view.totals.cash)} tone="neutral" />
                  <MetricCard
                    label={`Change over ${rangeLabel(bankTrendRange)}`}
                    value={bankTrend.changeAud === null ? "Not enough history yet" : formatSignedAud(bankTrend.changeAud)}
                    tone={bankTrend.changeAud === null ? "neutral" : bankTrend.changeAud >= 0 ? "positive" : "negative"}
                  />
                  <MetricCard
                    label="Average monthly bank change"
                    value={bankTrend.averageMonthlyChangeAud === null ? "Add more history" : formatSignedAud(bankTrend.averageMonthlyChangeAud)}
                    tone={
                      bankTrend.averageMonthlyChangeAud === null ? "neutral" : bankTrend.averageMonthlyChangeAud >= 0 ? "positive" : "negative"
                    }
                  />
                </div>
                <TrendChart
                  points={bankTrend.points}
                  compact
                  emptyLabel="Add monthly bank balances to see your bank trend."
                />
                <p className="subtle">
                  Bank trend uses bank cash only. It compares your saved monthly bank balances with your current bank cash total in the app.
                </p>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Refresh Insight</p>
                    <h2>What changed</h2>
                  </div>
                </div>
                {refreshInsight ? (
                  <div className="refresh-insight">
                    <div className="refresh-lines">
                      {refreshInsight.categories.map((item) => (
                        <p key={item.label}>{describeDelta(item.label, item.deltaAud)}</p>
                      ))}
                    </div>
                    {refreshInsight.movers.length ? (
                      <div className="mover-list">
                        <span className="subtle">Top movers</span>
                        {refreshInsight.movers.map((mover) => (
                          <div key={mover.name} className="mover-row">
                            <span>{mover.name}</span>
                            <strong className={clsx(mover.deltaAud >= 0 ? "positive-text" : "negative-text")}>
                              {formatSignedAud(mover.deltaAud)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty-panel compact-empty">
                    <p>No refresh breakdown yet.</p>
                    <span>After the next successful refresh, this card will explain what moved.</span>
                  </div>
                )}
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Snapshots</p>
                    <h2>Recent liquid trend</h2>
                  </div>
                </div>
                <TrendChart snapshots={snapshots.slice(-8)} compact />
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Status</p>
                    <h2>Refresh health</h2>
                  </div>
                </div>
                <div className="status-stack">
                  <div className={clsx("status-row", refreshState === "loading" && "loading")}>
                    <span>Pricing pipeline</span>
                    <strong>{refreshState === "loading" ? "Refreshing…" : "Idle"}</strong>
                  </div>
                  <div className="status-row">
                    <span>Refresh result</span>
                    <strong>{refreshSummary ? `${refreshSummary.updated} updated • ${refreshSummary.failed} failed` : "No refresh yet"}</strong>
                  </div>
                  <div className="status-row">
                    <span>Attention needed</span>
                    <strong>{attentionCount ? `${attentionCount} holding${attentionCount > 1 ? "s" : ""}` : "None"}</strong>
                  </div>
                  <div className="status-row">
                    <span>Monthly cashflow</span>
                    <strong className={clsx(cashflow.monthlyNet >= 0 ? "positive-text" : "negative-text")}>
                      {formatSignedAud(cashflow.monthlyNet)}
                    </strong>
                  </div>
                </div>
                {lastError ? <p className="error-banner">{lastError}</p> : null}
                {syncError ? <p className="error-banner">{syncError}</p> : null}
                {authMessage ? <p className="subtle">{authMessage}</p> : null}
                {refreshSummary ? (
                  <p className="subtle">
                    Last refresh finished in {(refreshSummary.durationMs / 1000).toFixed(1)}s
                    {refreshSummary.timedOut ? " and hit the time limit." : "."}
                  </p>
                ) : null}
                {demoMessage ? (
                  <button className="secondary-button full-width" onClick={clearDemoMessage} type="button">
                    {demoMessage}
                  </button>
                ) : null}
              </section>
            </section>
          </section>
        ) : null}

        {activeTab === "holdings" ? (
          <section className="tab-panel holdings-stack">
            <section className="surface section-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Portfolio</p>
                  <h2>Holdings</h2>
                </div>
                <div className="section-actions">
                  <div className="segmented-control">
                    {FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className={clsx(filter === option.value && "active")}
                        onClick={() => setFilter(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" onClick={() => setDraft({ ...EMPTY_FORM_VALUES })} type="button">
                    <Plus size={18} />
                    Add holding
                  </button>
                </div>
              </div>

              {holdings.length === 0 ? (
                <div className="empty-state">
                  <PieChart size={28} />
                  <div>
                    <h3>Your portfolio starts here</h3>
                    <p>Add holdings, then press refresh to fetch live market prices.</p>
                  </div>
                  <button className="secondary-button" onClick={() => loadSampleData(SAMPLE_HOLDINGS)} type="button">
                    Try sample portfolio
                  </button>
                </div>
              ) : (
                <>
                  <div className="allocation-card inset-surface">
                    <div className="section-head compact">
                      <div>
                        <p className="eyebrow">Allocation</p>
                        <h3>Portfolio mix</h3>
                      </div>
                      <span className="subtle">Manual assets are shown separately from liquid money.</span>
                    </div>
                    <div className="allocation-layout">
                      <div className="allocation-donut-wrap">
                        <div className="allocation-donut" style={{ background: allocationGradient }}>
                          <div className="allocation-donut-center">
                            <span>Liquid</span>
                            <strong>{formatAud(view.totals.liquid)}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="allocation-summary">
                        <div className="allocation-bar" aria-label="Asset allocation">
                          {allocation.map((segment) => (
                            <span
                              key={segment.label}
                              className={clsx("allocation-segment", segment.tone)}
                              style={{ width: `${segment.width}%` }}
                              title={`${segment.label}: ${formatAud(segment.value)}`}
                            />
                          ))}
                        </div>
                        <div className="allocation-legend allocation-legend-detailed">
                          {allocation.map((segment) => (
                            <span key={segment.label}>
                              <i className={clsx(segment.tone)} />
                              {segment.label}
                              <strong>{segment.width.toFixed(0)}%</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="holding-groups">
                    {grouped.map((group) => {
                      const GroupIcon = sectionIcons[group.type];
                      return (
                        <section key={group.type} className="holding-group">
                          <div className="group-head">
                            <div className="group-title">
                              <GroupIcon size={18} />
                              <h3>{HOLDING_TYPE_LABELS[group.type]}</h3>
                            </div>
                            <span>{group.items.length}</span>
                          </div>
                          <div className="holding-list">
                            {group.items.map((holding) => (
                              <article key={holding.id} className={clsx("holding-card", holding.priceStatus === "error" && "attention")}>
                                <div className="holding-primary">
                                  <div className="holding-copy">
                                    <div className="holding-title-row">
                                      <h4>{holding.name}</h4>
                                      {holding.badge ? <span className="inline-badge">{holding.badge}</span> : null}
                                    </div>
                                    <p className="subtle">
                                      {holding.subtitle}
                                      {holding.notes ? ` • ${holding.notes}` : ""}
                                    </p>
                                  </div>
                                  <div className="holding-meta">
                                    <strong>{formatAud(holding.valueAud)}</strong>
                                    <span>{holding.priceLabel}</span>
                                  </div>
                                </div>
                                <div className="holding-secondary">
                                  <div className="holding-quantity">
                                    <span>{holding.quantityLabel}</span>
                                    {holding.priceStatus !== "ok" ? (
                                      <span className={clsx("status-pill", holding.priceStatus === "error" ? "danger" : "warning")}>
                                        {holding.statusLabel}
                                      </span>
                                    ) : (
                                      <span className="status-pill ok">Priced</span>
                                    )}
                                  </div>
                                  <div className="holding-actions">
                                    <button
                                      className="ghost-button"
                                      onClick={() => setDraft(makeHoldingDraftFromExisting(holding.raw))}
                                      type="button"
                                      aria-label={`Edit ${holding.name}`}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      className="ghost-button danger"
                                      onClick={() => deleteHolding(holding.id)}
                                      type="button"
                                      aria-label={`Delete ${holding.name}`}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                                {holding.error ? (
                                  <div className="holding-warning">
                                    <AlertTriangle size={15} />
                                    <span>{holding.error}</span>
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </section>
        ) : null}

        {activeTab === "cashflow" ? (
          <section className="tab-panel planning-grid">
            <section className="surface section-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Cashflow</p>
                  <h2>Income</h2>
                </div>
                <button className="primary-button" onClick={() => setIncomeDraft({ ...EMPTY_INCOME_VALUES })} type="button">
                  <Plus size={18} />
                  Add income
                </button>
              </div>
              <div className="metric-strip">
                <MetricCard label="Recurring monthly income" value={formatAud(cashflow.recurringIncome)} tone="positive" />
                <MetricCard label="One-off income queued" value={formatAud(cashflow.oneOffIncome)} tone="neutral" />
              </div>
              {incomes.length ? (
                <div className="entry-list">
                  {incomes.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      title={entry.name}
                      subtitle={entry.frequency === "oneOff" ? "One-off income" : `${entry.frequency} income`}
                      notes={entry.notes}
                      amount={formatAud(entry.amount)}
                      onEdit={() => setIncomeDraft(makeIncomeDraftFromExisting(entry))}
                      onDelete={() => deleteIncome(entry.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-panel">
                  <p>No income added yet.</p>
                  <span>Add recurring pay, side income, or one-off inflows.</span>
                </div>
              )}
            </section>

            <section className="surface section-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Cashflow</p>
                  <h2>Expenses</h2>
                </div>
                <button className="primary-button" onClick={() => setExpenseDraft({ ...EMPTY_EXPENSE_VALUES })} type="button">
                  <Plus size={18} />
                  Add expense
                </button>
              </div>
              <div className="metric-strip">
                <MetricCard label="Monthly expenses" value={formatAud(cashflow.monthlyExpenses)} tone="negative" />
                <MetricCard label="Monthly net" value={formatSignedAud(cashflow.monthlyNet)} tone={cashflow.monthlyNet >= 0 ? "positive" : "negative"} />
              </div>
              {expenses.length ? (
                <div className="entry-list">
                  {expenses.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      title={entry.name}
                      subtitle="Monthly expense"
                      notes={entry.notes}
                      amount={formatAud(entry.amount)}
                      onEdit={() => setExpenseDraft(makeExpenseDraftFromExisting(entry))}
                      onDelete={() => deleteExpense(entry.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-panel">
                  <p>No expenses added yet.</p>
                  <span>Add your recurring monthly costs to see monthly burn and runway.</span>
                </div>
              )}
            </section>
          </section>
        ) : null}

        {activeTab === "projections" ? (
          <section className="tab-panel projections-stack">
            <section className="surface section-card projection-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Projection</p>
                  <h2>12-month liquid forecast</h2>
                </div>
              </div>
              <div className="metric-strip projection-metrics">
                <MetricCard label="Starting liquid money" value={formatAud(view.totals.liquid)} tone="neutral" />
                <MetricCard label="Monthly net" value={formatSignedAud(liquidProjection.monthlyNet)} tone={liquidProjection.monthlyNet >= 0 ? "positive" : "negative"} />
                <MetricCard label="Runway" value={formatMonths(liquidProjection.runwayMonths)} tone={liquidProjection.runwayMonths === null ? "positive" : "warning"} />
              </div>
              <p className="subtle">
                Assumption: projections are based on liquid money only. Manual assets are excluded unless you actually sell them outside the app.
              </p>
              <div className="runway-banner">
                {liquidProjection.monthlyNet >= 0
                  ? "Monthly cashflow is positive, so runway is not a constraint right now."
                  : `Monthly burn is ${formatAud(Math.abs(liquidProjection.monthlyNet))}. At this pace, runway is about ${formatMonths(liquidProjection.runwayMonths)}.`}
              </div>
              <ProjectionChart points={liquidProjection.series} startingBalance={view.totals.liquid} />
              <div className="projection-list projection-list-grid">
                {liquidProjection.series.map((point) => (
                  <div key={point.label} className="projection-row">
                    <div>
                      <strong>{point.label}</strong>
                      <span>{formatSignedAud(point.delta)} this month</span>
                    </div>
                    <strong>{formatAud(point.balance)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="tab-panel history-stack">
            <section className="surface section-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Bank History</p>
                  <h2>Monthly bank balances</h2>
                </div>
                <div className="section-actions">
                  <div className="segmented-control compact-toggle">
                    {bankRangeOptions.map((option) => (
                      <button
                        key={option.id}
                        className={clsx(bankTrendRange === option.id && "active")}
                        onClick={() => setBankTrendRange(option.id)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" onClick={() => setBankHistoryDraft({ ...EMPTY_BANK_HISTORY_VALUES })} type="button">
                    <Plus size={18} />
                    Add bank history
                  </button>
                </div>
              </div>

              <div className="metric-strip">
                <MetricCard label="Current bank balance" value={formatAud(view.totals.cash)} tone="neutral" />
                <MetricCard
                  label={`Change over ${rangeLabel(bankTrendRange)}`}
                  value={bankTrend.changeAud === null ? "Not enough history yet" : formatSignedAud(bankTrend.changeAud)}
                  tone={bankTrend.changeAud === null ? "neutral" : bankTrend.changeAud >= 0 ? "positive" : "negative"}
                />
                <MetricCard
                  label="Average monthly bank change"
                  value={bankTrend.averageMonthlyChangeAud === null ? "Add more history" : formatSignedAud(bankTrend.averageMonthlyChangeAud)}
                  tone={bankTrend.averageMonthlyChangeAud === null ? "neutral" : bankTrend.averageMonthlyChangeAud >= 0 ? "positive" : "negative"}
                />
              </div>

              <TrendChart
                points={bankTrend.points}
                compact
                emptyLabel="Add monthly bank balances to build a bank trend."
              />

              <div className="import-card inset-surface">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Ubank Statement Import</p>
                    <h3>Import Ubank CSV</h3>
                  </div>
                </div>
                <p className="subtle">Upload one or more Ubank CSV or PDF statements, review them together, then import only the valid non-duplicate month-end balances for each account.</p>
                <div
                  className={clsx("import-dropzone", ubankDragActive && "active")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setUbankDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      return;
                    }
                    setUbankDragActive(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setUbankDragActive(false);
                    void handleUbankCsvUpload(event.dataTransfer.files);
                  }}
                >
                  <div className="import-actions">
                    <label className="secondary-button file-trigger" htmlFor="ubank-csv-input">
                      Select CSV files
                    </label>
                    <span className="subtle">or drag and drop multiple CSV or PDF statements here</span>
                  </div>
                </div>
                <div className="import-actions">
                  <input
                    id="ubank-csv-input"
                    aria-label="Import Ubank statement files"
                    className="hidden-file-input"
                    type="file"
                    accept=".csv,text/csv,.pdf,application/pdf"
                    multiple
                    onChange={(event) => {
                      void handleUbankCsvUpload(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
                {ubankImportMessage ? <p className="subtle">{ubankImportMessage}</p> : null}
                {ubankImportError ? <p className="error-banner">{ubankImportError}</p> : null}
                {ubankImportItems.length ? (
                  <div className="import-review">
                    <div className="import-results">
                      {ubankImportItems.map((item) => (
                        <article key={item.id} className={clsx("import-result-row", item.status)}>
                          <div className="import-result-main">
                            <strong>{item.fileName}</strong>
                            <span>
                              {item.review
                                ? `${item.review.statementLabel} • ${item.review.endingBalanceAud === null ? "Ending balance needed" : formatAud(item.review.endingBalanceAud)} • ${item.review.transactionCount} transactions`
                                : item.error ?? "Could not read this file."}
                            </span>
                            {item.review?.accountName ? (
                              <span>
                                {item.review.accountName}
                                {item.review.accountId ? ` • ${item.review.accountId}` : ""}
                              </span>
                            ) : null}
                            {item.duplicateReason ? <span>{item.duplicateReason}</span> : null}
                            {item.status === "needs_input" ? (
                              <label className="import-balance-field">
                                <span>Ending balance in AUD</span>
                                <input
                                  inputMode="decimal"
                                  value={item.manualBalanceAud ?? ""}
                                  onChange={(event) =>
                                    setUbankImportItems((current) =>
                                      current.map((currentItem) =>
                                        currentItem.id === item.id ? { ...currentItem, manualBalanceAud: event.target.value } : currentItem,
                                      ),
                                    )
                                  }
                                  placeholder="10500.50"
                                />
                              </label>
                            ) : null}
                          </div>
                          <span
                            className={clsx(
                              "status-pill",
                              item.status === "ready" ? "ok" : item.status === "duplicate" ? "warning" : item.status === "needs_input" ? "warning" : "danger",
                            )}
                          >
                            {item.status === "ready"
                              ? "Ready to import"
                              : item.status === "needs_input"
                                ? "Needs ending balance"
                                : item.status === "duplicate"
                                  ? "Duplicate skipped"
                                  : "Parse error"}
                          </span>
                        </article>
                      ))}
                    </div>
                    <div className="modal-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setUbankImportItems([]);
                          setUbankImportMessage(null);
                          setUbankImportError(null);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button className="primary-button" onClick={saveImportedBankHistory} type="button">
                        Import valid statements
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {bankHistory.length ? (
                <div className="entry-list">
                  {[...groupedBankHistory]
                    .sort((left, right) => right.month.localeCompare(left.month))
                    .map((group) => (
                      <div key={group.month} className="history-group inset-surface">
                        <div className="group-head">
                          <div className="group-title">
                            <h3>{monthNameFromValue(group.month)}</h3>
                          </div>
                          <span>{formatAud(group.totalAud)}</span>
                        </div>
                        <div className="entry-list">
                          {group.accounts.map((entry) => (
                            <EntryRow
                              key={entry.id}
                              title={entry.accountName ?? "Bank account"}
                              subtitle={entry.accountId ? `Account ${entry.accountId}` : "Ending bank balance"}
                              notes={entry.notes}
                              amount={formatAud(entry.endingBalanceAud)}
                              onEdit={() => setBankHistoryDraft(makeBankHistoryDraftFromExisting(entry))}
                              onDelete={() => deleteBankHistoryEntry(entry.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-panel">
                  <p>No bank history added yet.</p>
                  <span>Add old month-end bank balances from your statements to build a cleaner bank trend.</span>
                </div>
              )}
            </section>

            <section className="surface section-card">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Liquid snapshot history</h2>
                </div>
                <div className="section-actions">
                  {snapshots.length ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        if (window.confirm("Clear all snapshot history?")) {
                          clearSnapshots();
                        }
                      }}
                      type="button"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
              </div>

              {snapshots.length === 0 ? (
                <div className="empty-panel">
                  <p>No refresh history yet.</p>
                  <span>Your liquid-money snapshot trail will appear here after refreshes.</span>
                </div>
              ) : (
                <>
                  <TrendChart snapshots={snapshots.slice(-12)} compact />
                  <div className="snapshot-list">
                    {[...snapshots].reverse().slice(0, 12).map((snapshot, index, source) => {
                      const previous = source[index + 1];
                      const liquidValue = getSnapshotLiquidValue(snapshot);
                      const previousLiquid = previous ? getSnapshotLiquidValue(previous) : null;
                      const rowDelta = previousLiquid === null ? null : liquidValue - previousLiquid;
                      return (
                        <article key={snapshot.id} className="snapshot-row">
                          <div className="snapshot-copy">
                            <strong>{formatTimestamp(snapshot.timestamp)}</strong>
                            <span>{formatRelativeTime(snapshot.timestamp)}</span>
                          </div>
                          <div className="snapshot-values">
                            <strong>{formatAud(liquidValue)}</strong>
                            <span className={clsx(rowDelta ? (rowDelta >= 0 ? "positive-text" : "negative-text") : "")}>
                              {rowDelta === null ? "First snapshot" : formatSignedAud(rowDelta)}
                            </span>
                          </div>
                          <button
                            className="ghost-button danger"
                            onClick={() => deleteSnapshot(snapshot.id)}
                            type="button"
                            aria-label={`Delete snapshot from ${formatTimestamp(snapshot.timestamp)}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </section>
	        ) : null}
          </section>
        </div>
      </div>

      {draft ? (
        <HoldingForm
          initialDraft={draft}
          onClose={() => setDraft(null)}
          onSave={(nextHolding) => {
            saveHolding(nextHolding);
            setDraft(null);
          }}
        />
      ) : null}

      {incomeDraft ? (
        <CashflowForm
          kind="income"
          initialDraft={incomeDraft}
          onClose={() => setIncomeDraft(null)}
          onSave={(entry) => {
            saveIncome(entry as Parameters<typeof saveIncome>[0]);
            setIncomeDraft(null);
          }}
        />
      ) : null}

      {expenseDraft ? (
        <CashflowForm
          kind="expense"
          initialDraft={expenseDraft}
          onClose={() => setExpenseDraft(null)}
          onSave={(entry) => {
            saveExpense(entry as Parameters<typeof saveExpense>[0]);
            setExpenseDraft(null);
          }}
        />
      ) : null}

      {bankHistoryDraft ? (
        <BankHistoryForm
          initialDraft={bankHistoryDraft}
          onClose={() => setBankHistoryDraft(null)}
          onSave={(entry) => {
            saveBankHistoryEntry(entry);
            setBankHistoryDraft(null);
          }}
        />
      ) : null}

      {showAuthModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAuthModal(false)}>
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <p className="eyebrow">Private Sync</p>
                <h2>Sign in for sync</h2>
              </div>
            </div>
            <div className="form-grid">
              <label className="full-span">
                <span>Email</span>
                <input
                  inputMode="email"
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="full-span">
                <span>Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Your password"
                />
              </label>
            </div>
            <p className="subtle">You stay signed in on this device until you sign out.</p>
            {syncError ? <div className="form-errors"><p>{syncError}</p></div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowAuthModal(false)} type="button">
                Cancel
              </button>
              <button
                className="secondary-button"
                onClick={async () => {
                  const success = await signUpWithPassword(authEmail, authPassword);
                  if (success) {
                    setAuthPassword("");
                  }
                }}
                type="button"
                disabled={!authEmail.trim() || !authPassword.trim()}
              >
                Create account
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  const success = await signInWithPassword(authEmail, authPassword);
                  if (success) {
                    setAuthPassword("");
                    setShowAuthModal(false);
                  }
                }}
                type="button"
                disabled={!authEmail.trim() || !authPassword.trim()}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative" | "warning";
}) {
  return (
    <article className={clsx("metric-card", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EntryRow({
  title,
  subtitle,
  notes,
  amount,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  notes?: string;
  amount: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="entry-row">
      <div>
        <strong>{title}</strong>
        <span className="subtle">
          {subtitle}
          {notes ? ` • ${notes}` : ""}
        </span>
      </div>
      <div className="entry-actions">
        <strong>{amount}</strong>
        <div className="holding-actions">
          <button className="ghost-button" onClick={onEdit} type="button" aria-label={`Edit ${title}`}>
            <Pencil size={16} />
          </button>
          <button className="ghost-button danger" onClick={onDelete} type="button" aria-label={`Delete ${title}`}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
