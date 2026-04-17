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
  Pencil,
  PieChart,
  Plus,
  RefreshCcw,
  TrendingUp,
  Trash2,
  Wallet,
} from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { BankHistoryForm } from "@/components/bank-history-form";
import { CashflowForm } from "@/components/cashflow-form";
import { HoldingForm } from "@/components/holding-form";
import { TrendChart } from "@/components/trend-chart";
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
} from "@/lib/types";

type TabId = "dashboard" | "holdings" | "cashflow" | "projections" | "history";

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
    hasSupabase,
    isSignedIn,
    authReady,
    userEmail,
    authMessage,
    syncError,
    showImportPrompt,
    signInWithMagicLink,
    signOut,
    importLocalToCloud,
    startFreshCloud,
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

  return (
    <main className="app-shell">
      <div className="app-backdrop" />
      <div className="app-frame">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Personal Finance</p>
            <h1>Tim&apos;s Dash</h1>
            <p className="subtle">Liquid money, live ETF and crypto pricing, and a clearer forward view of your bank cash in AUD.</p>
          </div>
          <div className="topbar-actions">
            {hasSupabase ? (
              isSignedIn ? (
                <>
                  <span className="inline-badge">{userEmail ?? "Signed in"}</span>
                  <button className="secondary-button" onClick={() => void signOut()} type="button">
                    Sign out
                  </button>
                </>
              ) : (
                <button className="secondary-button" onClick={() => setShowAuthModal(true)} type="button" disabled={!authReady}>
                  Sign in for sync
                </button>
              )
            ) : null}
            <button className="secondary-button" onClick={() => loadSampleData(SAMPLE_HOLDINGS)} type="button">
              Load Sample Data
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

        <nav className="tab-bar surface" aria-label="Sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={clsx("tab-button", activeTab === tab.id && "active")}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {hasSupabase && !isSignedIn ? (
          <section className="surface section-card">
            <div className="section-head compact">
              <div>
                <p className="eyebrow">Private Sync</p>
                <h2>Sign in for sync across devices</h2>
              </div>
            </div>
            <p className="subtle">Use a magic link email login to keep your dashboard private and synced between devices.</p>
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
                <TrendChart snapshots={snapshots.slice(-8)} />
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
              <div className="projection-list">
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
                emptyLabel="Add monthly bank balances to build a bank trend."
              />

              {bankHistory.length ? (
                <div className="entry-list">
                  {[...bankHistory]
                    .sort((left, right) => right.month.localeCompare(left.month))
                    .map((entry) => (
                      <EntryRow
                        key={entry.id}
                        title={monthNameFromValue(entry.month)}
                        subtitle="Ending bank balance"
                        notes={entry.notes}
                        amount={formatAud(entry.endingBalanceAud)}
                        onEdit={() => setBankHistoryDraft(makeBankHistoryDraftFromExisting(entry))}
                        onDelete={() => deleteBankHistoryEntry(entry.id)}
                      />
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
                  <TrendChart snapshots={snapshots.slice(-12)} />
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
                <h2>Sign in with magic link</h2>
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
            </div>
            {syncError ? <div className="form-errors"><p>{syncError}</p></div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowAuthModal(false)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  await signInWithMagicLink(authEmail);
                  setShowAuthModal(false);
                }}
                type="button"
                disabled={!authEmail.trim()}
              >
                Send magic link
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
