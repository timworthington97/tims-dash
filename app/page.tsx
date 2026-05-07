"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CircleDollarSign,
  Coins,
  Globe2,
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
import { calculateNomadPlanner } from "@/lib/nomad-planner";
import { AUSTRALIAN_TAX_YEAR, calculateSalaryPlanner } from "@/lib/salary-planner";
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

type TabId = "dashboard" | "holdings" | "cashflow" | "salary" | "nomad" | "projections" | "history";
type ThemeMode = "light" | "dark";
type SalaryRentFrequency = "weekly" | "monthly";
type NomadFxStatus = "loading" | "live" | "fallback" | "error";

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
  { id: "salary", label: "Salary Planner", icon: Calculator },
  { id: "nomad", label: "Nomad Planner", icon: Globe2 },
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

const salaryRentPresets: { city: string; weeklyAud: number }[] = [
  { city: "Sydney", weeklyAud: 800 },
  { city: "Melbourne", weeklyAud: 550 },
  { city: "Brisbane", weeklyAud: 625 },
  { city: "Perth", weeklyAud: 625 },
  { city: "Adelaide", weeklyAud: 550 },
  { city: "Canberra", weeklyAud: 600 },
];

const nomadScenarioPresets = [
  {
    label: "Tokyo",
    country: "Japan",
    city: "Tokyo",
    currencyCode: "JPY",
    fallbackAudExchangeRate: 0.00884,
    rentSourceLabel: "Numbeo Tokyo city-centre 1-bedroom benchmark, checked May 2026",
    monthlyRent: 216_000,
    monthlyLivingExpenses: 220_000,
    desiredMonthlySavings: 120_000,
    monthlyBuffer: 60_000,
  },
  {
    label: "Bangkok",
    country: "Thailand",
    city: "Bangkok",
    currencyCode: "THB",
    fallbackAudExchangeRate: 0.04289,
    rentSourceLabel: "Central Bangkok 1-bedroom guide range, checked May 2026",
    monthlyRent: 35_000,
    monthlyLivingExpenses: 42_000,
    desiredMonthlySavings: 25_000,
    monthlyBuffer: 12_000,
  },
  {
    label: "Lisbon",
    country: "Portugal",
    city: "Lisbon",
    currencyCode: "EUR",
    fallbackAudExchangeRate: 1.6238,
    rentSourceLabel: "Lisbon central 1-bedroom benchmark, checked May 2026",
    monthlyRent: 1_500,
    monthlyLivingExpenses: 1_150,
    desiredMonthlySavings: 750,
    monthlyBuffer: 300,
  },
  {
    label: "Bali",
    country: "Indonesia",
    city: "Bali",
    currencyCode: "IDR",
    fallbackAudExchangeRate: 0.00008,
    rentSourceLabel: "Bali Seminyak/Canggu 1-bedroom listing benchmark, checked May 2026",
    monthlyRent: 18_000_000,
    monthlyLivingExpenses: 18_000_000,
    desiredMonthlySavings: 10_000_000,
    monthlyBuffer: 5_000_000,
  },
];

function getSnapshotLiquidValue(snapshot: PortfolioSnapshot) {
  return snapshot.totalLiquidValue ?? snapshot.totalCash + snapshot.totalEtfValue + snapshot.totalCryptoValue;
}

function isUsableLiquidSnapshot(snapshot: PortfolioSnapshot) {
  const liquidValue = getSnapshotLiquidValue(snapshot);
  return Number.isFinite(liquidValue) && liquidValue > 0;
}

function findSnapshotAtOrBefore(snapshots: PortfolioSnapshot[], timestamp: number) {
  const usableSnapshots = snapshots.filter(isUsableLiquidSnapshot);
  const successful = [...usableSnapshots].reverse().find((snapshot) => snapshot.status === "success" && new Date(snapshot.timestamp).getTime() <= timestamp);

  if (successful) {
    return successful;
  }

  return [...usableSnapshots].reverse().find((snapshot) => new Date(snapshot.timestamp).getTime() <= timestamp) ?? null;
}

function buildPeriodMovement(snapshots: PortfolioSnapshot[], currentLiquid: number, now: number, hours: number, label: string) {
  const baseline = findSnapshotAtOrBefore(snapshots, now - hours * 60 * 60 * 1000);
  const oldestUsableSnapshot = snapshots.filter(isUsableLiquidSnapshot)[0] ?? null;

  if (!baseline && !oldestUsableSnapshot) {
    return {
      label,
      available: false,
      amount: 0,
      percent: 0,
      direction: "flat" as const,
      baselineLabel: "Add more snapshot history",
    };
  }

  const comparisonSnapshot = baseline ?? oldestUsableSnapshot;
  const baselineValue = getSnapshotLiquidValue(comparisonSnapshot);
  const amount = currentLiquid - baselineValue;
  const percent = baselineValue === 0 ? 0 : (amount / baselineValue) * 100;
  const baselineTime = new Date(comparisonSnapshot.timestamp).getTime();
  const approximate = baseline === null && baselineTime > now - hours * 60 * 60 * 1000;

  return {
    label,
    available: true,
    amount,
    percent,
    direction: amount > 0 ? ("up" as const) : amount < 0 ? ("down" as const) : ("flat" as const),
    baselineLabel: approximate ? `from oldest saved snapshot (${formatRelativeTime(comparisonSnapshot.timestamp)})` : formatRelativeTime(comparisonSnapshot.timestamp),
  };
}

function describeRefreshDelta(label: string, deltaAud: number) {
  if (Math.abs(deltaAud) < 0.005) {
    return `${label} did not materially move`;
  }

  return `${label} ${deltaAud > 0 ? "added" : "reduced"} ${formatAud(Math.abs(deltaAud))}`;
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScenarioMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${Math.round(value).toLocaleString("en-AU")}`;
}

function formatAudEquivalent(value: number) {
  return `AUD ${Math.round(value).toLocaleString("en-AU")}`;
}

function formatAudPerWeekFromMonthly(monthlyValue: number, audExchangeRate: number) {
  const weeklyAud = (monthlyValue * audExchangeRate * 12) / 52;
  return `${formatAud(weeklyAud)} / week`;
}

function findNomadPresetByCurrency(currencyCode: string) {
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  return nomadScenarioPresets.find((preset) => preset.currencyCode === normalizedCurrency) ?? null;
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
  const [salaryPlannerSalary, setSalaryPlannerSalary] = useState("100000");
  const [salaryPlannerRent, setSalaryPlannerRent] = useState("");
  const [salaryPlannerRentFrequency, setSalaryPlannerRentFrequency] = useState<SalaryRentFrequency>("weekly");
  const [salaryPlannerExtraExpenses, setSalaryPlannerExtraExpenses] = useState("");
  const [salaryPlannerTargetSavings, setSalaryPlannerTargetSavings] = useState("");
  const [salaryPlannerMedicare, setSalaryPlannerMedicare] = useState(true);
  const [salaryPlannerHelp, setSalaryPlannerHelp] = useState(false);
  const [nomadCountry, setNomadCountry] = useState("Japan");
  const [nomadCity, setNomadCity] = useState("Tokyo");
  const [nomadCurrency, setNomadCurrency] = useState("JPY");
  const [nomadAudExchangeRate, setNomadAudExchangeRate] = useState("0.00884");
  const [nomadFxStatus, setNomadFxStatus] = useState<NomadFxStatus>("loading");
  const [nomadFxSource, setNomadFxSource] = useState("Loading live AUD rate");
  const [nomadFxDate, setNomadFxDate] = useState<string | null>(null);
  const [nomadRentSource, setNomadRentSource] = useState(nomadScenarioPresets[0].rentSourceLabel);
  const [nomadRent, setNomadRent] = useState("216000");
  const [nomadLivingExpenses, setNomadLivingExpenses] = useState("220000");
  const [nomadSavingsTarget, setNomadSavingsTarget] = useState("120000");
  const [nomadBuffer, setNomadBuffer] = useState("60000");

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const currencyCode = nomadCurrency.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    const presetFallback = findNomadPresetByCurrency(currencyCode);
    const fallbackRate = presetFallback?.fallbackAudExchangeRate ?? 1;
    const controller = new AbortController();
    const applyFxState = (callback: () => void) => {
      queueMicrotask(() => {
        if (!controller.signal.aborted) {
          callback();
        }
      });
    };

    if (!currencyCode) {
      applyFxState(() => {
        setNomadFxStatus("fallback");
        setNomadAudExchangeRate("1");
        setNomadFxSource("Enter a currency code to load AUD conversion");
        setNomadFxDate(null);
      });
      return () => controller.abort();
    }

    if (currencyCode === "AUD") {
      applyFxState(() => {
        setNomadFxStatus("live");
        setNomadAudExchangeRate("1");
        setNomadFxSource("Same currency");
        setNomadFxDate(new Date().toISOString());
      });
      return () => controller.abort();
    }

    applyFxState(() => {
      setNomadFxStatus("loading");
      setNomadFxSource("Loading live daily AUD rate");
      setNomadFxDate(null);
    });

    fetch(`/api/fx?from=${encodeURIComponent(currencyCode)}&to=AUD`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          rate?: number;
          date?: string;
          source?: string;
          error?: string;
        };

        if (!response.ok || !Number.isFinite(payload.rate)) {
          throw new Error(payload.error ?? "Could not load the live exchange rate.");
        }

        setNomadAudExchangeRate(String(payload.rate));
        setNomadFxStatus("live");
        setNomadFxSource(payload.source ?? "Live daily exchange-rate API");
        setNomadFxDate(payload.date ?? new Date().toISOString());
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setNomadAudExchangeRate(String(fallbackRate));
        setNomadFxStatus("error");
        setNomadFxSource(error instanceof Error ? `Live FX failed; using preset fallback (${error.message})` : "Live FX failed; using preset fallback");
        setNomadFxDate(null);
      });

    return () => controller.abort();
  }, [nomadCurrency]);

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
  const liquidMovements = useMemo(
    () => [
      buildPeriodMovement(snapshots, view.totals.liquid, currentTime, 24, "24h"),
      buildPeriodMovement(snapshots, view.totals.liquid, currentTime, 24 * 7, "7d"),
    ],
    [currentTime, snapshots, view.totals.liquid],
  );
  const primaryMovement = liquidMovements.find((movement) => movement.available) ?? null;
  const cashflow = useMemo(() => calculateCashflow(incomes, expenses), [incomes, expenses]);
  const salaryPlannerRentInputAmount = parseMoneyInput(salaryPlannerRent);
  const salaryPlannerRentAmount =
    salaryPlannerRentFrequency === "weekly" ? (salaryPlannerRentInputAmount * 52) / 12 : salaryPlannerRentInputAmount;
  const salaryPlannerExtraExpenseAmount = parseMoneyInput(salaryPlannerExtraExpenses);
  const salaryPlannerExpenses = cashflow.monthlyExpenses + salaryPlannerRentAmount + salaryPlannerExtraExpenseAmount;
  const salaryPlanner = useMemo(
    () =>
      calculateSalaryPlanner({
        annualSalary: parseMoneyInput(salaryPlannerSalary),
        monthlyExpenses: salaryPlannerExpenses,
        includeMedicareLevy: salaryPlannerMedicare,
        includeHelpRepayment: salaryPlannerHelp,
        targetMonthlySavings: parseMoneyInput(salaryPlannerTargetSavings),
      }),
    [salaryPlannerSalary, salaryPlannerExpenses, salaryPlannerHelp, salaryPlannerMedicare, salaryPlannerTargetSavings],
  );
  const salaryScenarioPresets = useMemo(
    () =>
      [70_000, 85_000, 100_000, 120_000].map((salary) =>
        calculateSalaryPlanner({
          annualSalary: salary,
          monthlyExpenses: salaryPlannerExpenses,
          includeMedicareLevy: salaryPlannerMedicare,
          includeHelpRepayment: salaryPlannerHelp,
        }),
      ),
    [salaryPlannerExpenses, salaryPlannerHelp, salaryPlannerMedicare],
  );
  const cityRentComparisons = useMemo(() => {
    const annualSalary = parseMoneyInput(salaryPlannerSalary);
    const comparisons = salaryRentPresets.map((preset) => {
      const monthlyRent = (preset.weeklyAud * 52) / 12;
      const scenario = calculateSalaryPlanner({
        annualSalary,
        monthlyExpenses: cashflow.monthlyExpenses + salaryPlannerExtraExpenseAmount + monthlyRent,
        includeMedicareLevy: salaryPlannerMedicare,
        includeHelpRepayment: salaryPlannerHelp,
      });

      return {
        city: preset.city,
        weeklyRent: preset.weeklyAud,
        monthlyRent,
        monthlySurplus: scenario.savingsProjection.monthlySurplus,
        yearlySurplus: scenario.savingsProjection.twelveMonths,
        cashPositionInTwelveMonths: view.totals.cash + scenario.savingsProjection.twelveMonths,
      };
    });
    const strongest = [...comparisons].sort((left, right) => right.monthlySurplus - left.monthlySurplus)[0] ?? null;
    const mostExpensive = [...comparisons].sort((left, right) => left.monthlySurplus - right.monthlySurplus)[0] ?? null;
    const selectedCity = comparisons.find((item) => Math.abs(item.monthlyRent - salaryPlannerRentAmount) < 0.01) ?? null;

    return {
      items: comparisons,
      strongest,
      mostExpensive,
      selectedCity,
    };
  }, [
    cashflow.monthlyExpenses,
    salaryPlannerExtraExpenseAmount,
    salaryPlannerHelp,
    salaryPlannerMedicare,
    salaryPlannerRentAmount,
    salaryPlannerSalary,
    view.totals.cash,
  ]);
  const salaryPlannerTwelveMonthCashChange = salaryPlanner.savingsProjection.monthlySurplus * 12;
  const salaryPlannerTwelveMonthCashPosition = view.totals.cash + salaryPlannerTwelveMonthCashChange;
  const nomadPlanner = useMemo(
    () =>
      calculateNomadPlanner({
        country: nomadCountry,
        city: nomadCity,
        currencyCode: nomadCurrency.trim().toUpperCase() || "AUD",
        audExchangeRate: parseMoneyInput(nomadAudExchangeRate) || 1,
        monthlyRent: parseMoneyInput(nomadRent),
        monthlyLivingExpenses: parseMoneyInput(nomadLivingExpenses),
        desiredMonthlySavings: parseMoneyInput(nomadSavingsTarget),
        monthlyBuffer: parseMoneyInput(nomadBuffer),
      }),
    [nomadAudExchangeRate, nomadBuffer, nomadCity, nomadCountry, nomadCurrency, nomadLivingExpenses, nomadRent, nomadSavingsTarget],
  );
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
                  <div className={clsx("hero-figure", primaryMovement?.direction)}>
                    <AnimatedNumber value={view.totals.liquid} format={formatAud} />
                  </div>
                <p className="hero-support subtle">
                  Liquid money includes cash, ETFs, and crypto. Manual assets are shown separately and are excluded from forward planning.
                </p>
                <div className="hero-meta">
                  <div className="movement-strip" aria-label="Liquid movement">
                    {liquidMovements.map((movement) => (
                      <div key={movement.label} className={clsx("movement-card", movement.available && movement.direction)}>
                        <span>{movement.label}</span>
                        <strong>{movement.available ? formatSignedAud(movement.amount) : "Not enough history"}</strong>
                        <small>
                          {movement.available
                            ? `${formatPercent(Math.abs(movement.percent))} from ${movement.baselineLabel}`
                            : movement.baselineLabel}
                        </small>
                      </div>
                    ))}
                  </div>
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
                    <h2>Market movement</h2>
                  </div>
                </div>
                {refreshInsight ? (
                  <div className="refresh-insight">
                    <p className="subtle">{refreshInsight.summaryText}</p>
                    {refreshInsight.notes.length ? (
                      <div className="refresh-lines">
                        {refreshInsight.notes.map((note) => (
                          <p key={note.id} className={clsx(note.tone && `tone-${note.tone}`)}>
                            {note.text}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <div className="refresh-lines">
                      {refreshInsight.categories.map((item) => (
                        <p key={item.label}>{describeRefreshDelta(item.label, item.deltaAud)}</p>
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
                    <span>Refresh time</span>
                    <strong>{refreshSummary ? `${(refreshSummary.durationMs / 1000).toFixed(1)}s${refreshSummary.timedOut ? " • timed out" : ""}` : "Not run yet"}</strong>
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

        {activeTab === "salary" ? (
          <section className="tab-panel salary-planner-stack">
            <section className="surface section-card salary-hero-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Australia Salary Planner</p>
                  <h2>What would this salary actually change?</h2>
                </div>
              </div>
              <p className="salary-planner-lead">
                At {formatAud(salaryPlanner.taxBreakdown.grossAnnualSalary)} gross, estimated take-home is{" "}
                <strong>{formatAud(salaryPlanner.takeHome.monthly)} per month</strong>. After your current expense benchmark, that leaves{" "}
                <strong className={clsx(salaryPlanner.savingsProjection.monthlySurplus >= 0 ? "positive-text" : "negative-text")}>
                  {formatSignedAud(salaryPlanner.savingsProjection.monthlySurplus)}
                </strong>{" "}
                per month.
              </p>
              <div className="metric-strip">
                <MetricCard label="Net annual take-home" value={formatAud(salaryPlanner.takeHome.annual)} tone="positive" />
                <MetricCard label="Net monthly" value={formatAud(salaryPlanner.takeHome.monthly)} tone="neutral" />
                <MetricCard label="Monthly surplus" value={formatSignedAud(salaryPlanner.savingsProjection.monthlySurplus)} tone={salaryPlanner.savingsProjection.monthlySurplus >= 0 ? "positive" : "negative"} />
              </div>
            </section>

            <section className="salary-planner-grid">
              <section className="surface section-card salary-cash-position-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Scenario outcome</p>
                    <h2>Cash position in 12 months</h2>
                  </div>
                </div>
                <strong>{formatAud(salaryPlannerTwelveMonthCashPosition)}</strong>
                <p className={clsx("salary-cash-position-delta", salaryPlannerTwelveMonthCashChange >= 0 ? "positive-text" : "negative-text")}>
                  {formatSignedAud(salaryPlannerTwelveMonthCashChange)} compared with today
                </p>
                <p className="subtle">
                  Starts with your current bank cash of {formatAud(view.totals.cash)}, then applies this planner&apos;s 12-month surplus.
                </p>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Inputs</p>
                    <h2>Scenario controls</h2>
                  </div>
                </div>
                <div className="form-grid salary-form-grid">
                  <label className="full-span">
                    <span>Annual gross salary</span>
                    <input
                      inputMode="decimal"
                      value={salaryPlannerSalary}
                      onChange={(event) => setSalaryPlannerSalary(event.target.value)}
                      placeholder="100000"
                    />
                  </label>
                  <label>
                    <span>Hypothetical rent</span>
                    <input
                      inputMode="decimal"
                      value={salaryPlannerRent}
                      onChange={(event) => setSalaryPlannerRent(event.target.value)}
                      placeholder={salaryPlannerRentFrequency === "weekly" ? "Weekly rent" : "Monthly rent"}
                    />
                  </label>
                  <div className="salary-rent-frequency">
                    <span>Rent frequency</span>
                    <div className="segmented-control compact-toggle">
                      {(["weekly", "monthly"] as const).map((frequency) => (
                        <button
                          key={frequency}
                          className={clsx(salaryPlannerRentFrequency === frequency && "active")}
                          onClick={() => setSalaryPlannerRentFrequency(frequency)}
                          type="button"
                        >
                          {frequency === "weekly" ? "Weekly" : "Monthly"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="salary-rent-presets full-span">
                    <span>CBD 1-bedroom apartment rent preset</span>
                    <div className="salary-preset-grid">
                      {salaryRentPresets.map((preset) => (
                        <button
                          key={preset.city}
                          className="secondary-button"
                          onClick={() => {
                            setSalaryPlannerRent(String(preset.weeklyAud));
                            setSalaryPlannerRentFrequency("weekly");
                          }}
                          type="button"
                        >
                          <strong>{preset.city}</strong>
                          <small>{formatAud(preset.weeklyAud)} / week</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label>
                    <span>Extra monthly expenses</span>
                    <input
                      inputMode="decimal"
                      value={salaryPlannerExtraExpenses}
                      onChange={(event) => setSalaryPlannerExtraExpenses(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    <span>Target monthly savings</span>
                    <input
                      inputMode="decimal"
                      value={salaryPlannerTargetSavings}
                      onChange={(event) => setSalaryPlannerTargetSavings(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                <div className="salary-toggle-list">
                  <button
                    className={clsx("salary-toggle", salaryPlannerMedicare && "active")}
                    onClick={() => setSalaryPlannerMedicare((current) => !current)}
                    type="button"
                  >
                    <span>
                      <strong>Include Medicare levy</strong>
                      <small>Uses the 2% levy with the low-income phase-in.</small>
                    </span>
                    <i>{salaryPlannerMedicare ? "On" : "Off"}</i>
                  </button>
                  <button
                    className={clsx("salary-toggle", salaryPlannerHelp && "active")}
                    onClick={() => setSalaryPlannerHelp((current) => !current)}
                    type="button"
                  >
                    <span>
                      <strong>Include HELP/HECS</strong>
                      <small>Uses the 2025-26 marginal study-loan repayment rules.</small>
                    </span>
                    <i>{salaryPlannerHelp ? "On" : "Off"}</i>
                  </button>
                </div>
                <div className="salary-presets">
                  {[70_000, 85_000, 100_000, 120_000].map((preset) => (
                    <button key={preset} className="secondary-button" onClick={() => setSalaryPlannerSalary(String(preset))} type="button">
                      {formatAud(preset)}
                    </button>
                  ))}
                </div>
                <p className="subtle">
                  Expense benchmark: {formatAud(cashflow.monthlyExpenses)} from Tim&apos;s Dash expenses
                  {salaryPlannerRentAmount > 0
                    ? ` plus ${formatAud(salaryPlannerRentAmount)} rent per month (${formatAud(salaryPlannerRentInputAmount)} ${salaryPlannerRentFrequency})`
                    : ""}
                  {salaryPlannerExtraExpenseAmount > 0 ? ` plus ${formatAud(salaryPlannerExtraExpenseAmount)} extra` : ""}. Scenario inputs stay local to this planner.
                </p>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Take-home</p>
                    <h2>Tax and repayment breakdown</h2>
                  </div>
                </div>
                <div className="salary-breakdown-list">
                  <div>
                    <span>Gross annual salary</span>
                    <strong>{formatAud(salaryPlanner.taxBreakdown.grossAnnualSalary)}</strong>
                  </div>
                  <div>
                    <span>Estimated resident income tax</span>
                    <strong>{formatAud(salaryPlanner.taxBreakdown.incomeTax)}</strong>
                  </div>
                  <div>
                    <span>Estimated Medicare levy</span>
                    <strong>{formatAud(salaryPlanner.taxBreakdown.medicareLevy)}</strong>
                  </div>
                  <div>
                    <span>Estimated HELP/HECS repayment</span>
                    <strong>{formatAud(salaryPlanner.taxBreakdown.helpRepayment)}</strong>
                  </div>
                  <div className="salary-breakdown-total">
                    <span>Net annual take-home</span>
                    <strong>{formatAud(salaryPlanner.takeHome.annual)}</strong>
                  </div>
                </div>
                <div className="metric-strip salary-frequency-strip">
                  <MetricCard label="Monthly" value={formatAud(salaryPlanner.takeHome.monthly)} tone="neutral" />
                  <MetricCard label="Fortnightly" value={formatAud(salaryPlanner.takeHome.fortnightly)} tone="neutral" />
                  <MetricCard label="Weekly" value={formatAud(salaryPlanner.takeHome.weekly)} tone="neutral" />
                </div>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Savings after expenses</p>
                    <h2>Build-up forecast</h2>
                  </div>
                </div>
                <div className="salary-savings-grid">
                  <MetricCard label="Saved expenses baseline" value={formatAud(cashflow.monthlyExpenses)} tone="neutral" />
                  <MetricCard label="Hypothetical rent" value={formatAud(salaryPlannerRentAmount)} tone={salaryPlannerRentAmount > 0 ? "warning" : "neutral"} />
                  <MetricCard label="Total scenario expenses" value={formatAud(salaryPlanner.savingsProjection.monthlyExpenses)} tone="neutral" />
                  <MetricCard label="Monthly surplus" value={formatSignedAud(salaryPlanner.savingsProjection.monthlySurplus)} tone={salaryPlanner.savingsProjection.monthlySurplus >= 0 ? "positive" : "negative"} />
                  <MetricCard label="3 months" value={formatSignedAud(salaryPlanner.savingsProjection.threeMonths)} tone={salaryPlanner.savingsProjection.threeMonths >= 0 ? "positive" : "negative"} />
                  <MetricCard label="6 months" value={formatSignedAud(salaryPlanner.savingsProjection.sixMonths)} tone={salaryPlanner.savingsProjection.sixMonths >= 0 ? "positive" : "negative"} />
                  <MetricCard label="12 months" value={formatSignedAud(salaryPlanner.savingsProjection.twelveMonths)} tone={salaryPlanner.savingsProjection.twelveMonths >= 0 ? "positive" : "negative"} />
                </div>
                <div className="runway-banner">
                  {salaryPlanner.savingsProjection.monthlySurplus >= 0
                    ? `At this salary, you could build roughly ${formatAud(Math.max(0, salaryPlanner.savingsProjection.sixMonths))} in 6 months after your current expenses.`
                    : `At this salary, your expense benchmark is higher than take-home by ${formatAud(Math.abs(salaryPlanner.savingsProjection.monthlySurplus))} per month.`}
                </div>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Target helper</p>
                    <h2>Salary needed</h2>
                  </div>
                </div>
                {salaryPlanner.targetSalaryEstimate ? (
                  <div className="target-salary-card inset-surface">
                    <span>To save {formatAud(salaryPlanner.targetSalaryEstimate.targetMonthlySavings)} per month</span>
                    <strong>{formatAud(salaryPlanner.targetSalaryEstimate.requiredGrossSalary)}</strong>
                    <p className="subtle">
                      Estimated take-home would be {formatAud(salaryPlanner.targetSalaryEstimate.monthlyTakeHome)} per month, leaving about{" "}
                      {formatAud(salaryPlanner.targetSalaryEstimate.monthlySurplus)} after expenses.
                    </p>
                  </div>
                ) : (
                  <div className="empty-panel compact-empty">
                    <p>Add a target monthly saving amount.</p>
                    <span>Tim&apos;s Dash will estimate the gross salary needed under the same tax assumptions.</span>
                  </div>
                )}
                <div className="status-stack salary-comparison-stack">
                  <div className="status-row">
                    <span>Income used in this scenario</span>
                    <strong>Salary only</strong>
                  </div>
                  <div className="status-row">
                    <span>Saved Tim&apos;s Dash income</span>
                    <strong>Excluded</strong>
                  </div>
                </div>
                <p className="subtle">
                  The planner uses your hypothetical salary as the income source. Saved recurring income from Income &amp; Expenses is not added on top.
                </p>
              </section>
            </section>

            <section className="surface section-card">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Quick comparison</p>
                  <h2>Salary presets after expenses</h2>
                </div>
              </div>
              <div className="salary-scenario-grid">
                {salaryScenarioPresets.map((scenario) => (
                  <article key={scenario.taxBreakdown.grossAnnualSalary} className="salary-scenario-card inset-surface">
                    <span>{formatAud(scenario.taxBreakdown.grossAnnualSalary)} gross</span>
                    <strong>{formatAud(scenario.takeHome.monthly)} / month</strong>
                    <small className={clsx(scenario.savingsProjection.monthlySurplus >= 0 ? "positive-text" : "negative-text")}>
                      {formatSignedAud(scenario.savingsProjection.monthlySurplus)} after expenses
                    </small>
                  </article>
                ))}
              </div>
              <p className="subtle salary-assumption-note">
                Planning estimate only. Uses {AUSTRALIAN_TAX_YEAR} Australian resident tax rates, Medicare levy settings for a single non-SAPTO taxpayer,
                and salary-only repayment income for HELP/HECS. It does not include deductions, offsets, salary sacrifice, Medicare levy surcharge,
                private-health settings, spouse/family thresholds, or formal tax advice.
              </p>
            </section>

            <section className="surface section-card">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Rent comparison</p>
                  <h2>City rent impact</h2>
                </div>
              </div>
              {cityRentComparisons.strongest && cityRentComparisons.mostExpensive ? (
                <div className="city-rent-summary inset-surface">
                  <p>
                    <strong>{cityRentComparisons.strongest.city}</strong> would leave you with the strongest monthly surplus in this scenario.
                  </p>
                  <p>
                    Compared with {cityRentComparisons.mostExpensive.city}, it leaves about{" "}
                    <strong>
                      {formatAud(
                        Math.abs(cityRentComparisons.strongest.monthlySurplus - cityRentComparisons.mostExpensive.monthlySurplus),
                      )}
                    </strong>{" "}
                    more per month, or{" "}
                    <strong>
                      {formatAud(
                        Math.abs(cityRentComparisons.strongest.yearlySurplus - cityRentComparisons.mostExpensive.yearlySurplus),
                      )}
                    </strong>{" "}
                    more per year.
                  </p>
                  {cityRentComparisons.selectedCity ? (
                    <p>
                      Your current rent field matches {cityRentComparisons.selectedCity.city}; these rows show what changes if you swap cities only.
                    </p>
                  ) : (
                    <p>Your current rent field is custom; these rows compare the city presets against that same salary and tax setup.</p>
                  )}
                </div>
              ) : null}
              <div className="city-rent-table">
                <div className="city-rent-table-head">
                  <span>City</span>
                  <span>Rent</span>
                  <span>Monthly surplus</span>
                  <span>Yearly surplus</span>
                  <span>12-month cash</span>
                </div>
                {cityRentComparisons.items.map((item) => {
                  const deltaFromCurrent = item.monthlySurplus - salaryPlanner.savingsProjection.monthlySurplus;
                  return (
                    <article key={item.city} className="city-rent-row">
                      <div>
                        <strong>{item.city}</strong>
                        <small>
                          {deltaFromCurrent === 0
                            ? "Same as current scenario"
                            : `${deltaFromCurrent > 0 ? "Leaves" : "Costs"} ${formatAud(Math.abs(deltaFromCurrent))} ${deltaFromCurrent > 0 ? "more" : "more"} / month vs current`}
                        </small>
                      </div>
                      <span>{formatAud(item.weeklyRent)} / wk</span>
                      <strong className={clsx(item.monthlySurplus >= 0 ? "positive-text" : "negative-text")}>
                        {formatSignedAud(item.monthlySurplus)}
                      </strong>
                      <strong className={clsx(item.yearlySurplus >= 0 ? "positive-text" : "negative-text")}>
                        {formatSignedAud(item.yearlySurplus)}
                      </strong>
                      <strong>{formatAud(item.cashPositionInTwelveMonths)}</strong>
                    </article>
                  );
                })}
              </div>
              <p className="subtle salary-assumption-note">
                City rent comparison is scenario-only. It uses the same salary, Medicare, HELP/HECS, saved expense baseline, and extra expense inputs, then swaps only the city rent preset.
              </p>
            </section>
          </section>
        ) : null}

        {activeTab === "nomad" ? (
          <section className="tab-panel nomad-planner-stack">
            <section className="surface section-card nomad-hero-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Nomad Planner</p>
                  <h2>Could I live there?</h2>
                </div>
              </div>
              <p className="salary-planner-lead">
                {nomadPlanner.scenarioSummary.summaryText} {nomadPlanner.scenarioSummary.savingsText}
              </p>
              <div className="metric-strip">
                <MetricCard
                  label="Break-even income"
                  value={formatScenarioMoney(nomadPlanner.incomeTargets.breakEvenMonthly, nomadPlanner.scenarioSummary.currencyCode)}
                  tone="neutral"
                />
                <MetricCard
                  label="Comfortable target in AUD"
                  value={formatAudEquivalent(nomadPlanner.incomeTargets.comfortableMonthlyAud)}
                  tone="positive"
                />
                <MetricCard
                  label="Safer target in AUD"
                  value={formatAudEquivalent(nomadPlanner.incomeTargets.saferMonthlyAud)}
                  tone="warning"
                />
              </div>
            </section>

            <section className="nomad-planner-grid">
              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Destination</p>
                    <h2>Scenario setup</h2>
                  </div>
                </div>
                <div className="form-grid salary-form-grid">
                  <label>
                    <span>Target country</span>
                    <input value={nomadCountry} onChange={(event) => setNomadCountry(event.target.value)} placeholder="Japan" />
                  </label>
                  <label>
                    <span>Target city</span>
                    <input value={nomadCity} onChange={(event) => setNomadCity(event.target.value)} placeholder="Tokyo" />
                  </label>
                  <label>
                    <span>Scenario currency</span>
                    <input value={nomadCurrency} onChange={(event) => setNomadCurrency(event.target.value.toUpperCase())} placeholder="AUD" />
                  </label>
                  <label>
                    <span>Live AUD conversion</span>
                    <input
                      inputMode="decimal"
                      readOnly
                      value={nomadAudExchangeRate}
                      placeholder="1"
                    />
                  </label>
                </div>
                <div className={clsx("nomad-source-note inset-surface", nomadFxStatus === "error" ? "warning" : null)}>
                  <strong>
                    {nomadFxStatus === "loading" ? <LoaderCircle aria-hidden="true" className="nomad-fx-spinner" size={15} /> : null}
                    {nomadFxStatus === "loading"
                      ? "Fetching today's AUD rate"
                      : nomadFxStatus === "live"
                        ? "Using live daily AUD rate"
                        : "Using fallback AUD rate"}
                  </strong>
                  <span>
                    {nomadFxSource}
                    {nomadFxDate ? ` • ${formatTimestamp(nomadFxDate)}` : ""}
                  </span>
                </div>
                <div className="salary-rent-presets full-span nomad-presets">
                  <span>Current 1-bedroom city rent presets</span>
                  <div className="salary-preset-grid">
                    {nomadScenarioPresets.map((preset) => {
                      const liveRateAppliesToPreset = nomadPlanner.scenarioSummary.currencyCode === preset.currencyCode;
                      const presetAudRate = liveRateAppliesToPreset ? nomadPlanner.scenarioSummary.audExchangeRate : preset.fallbackAudExchangeRate;

                      return (
                        <button
                          key={preset.label}
                          className="secondary-button nomad-rent-preset-button"
                          onClick={() => {
                            setNomadCountry(preset.country);
                            setNomadCity(preset.city);
                            setNomadCurrency(preset.currencyCode);
                            setNomadAudExchangeRate(String(preset.fallbackAudExchangeRate));
                            setNomadRentSource(preset.rentSourceLabel);
                            setNomadRent(String(preset.monthlyRent));
                            setNomadLivingExpenses(String(preset.monthlyLivingExpenses));
                            setNomadSavingsTarget(String(preset.desiredMonthlySavings));
                            setNomadBuffer(String(preset.monthlyBuffer));
                          }}
                          type="button"
                        >
                          <strong>{preset.label}</strong>
                          <span>{formatAudPerWeekFromMonthly(preset.monthlyRent, presetAudRate)}</span>
                          <small>{formatScenarioMoney(preset.monthlyRent, preset.currencyCode)} / month</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="subtle">
                  Nomad Planner values stay in this scenario only. Rent preset: {nomadRentSource}. You can still edit the rent field manually.
                  Currency conversion uses live daily data where available, with the preset rate only as a fallback.
                </p>
              </section>

              <section className="surface section-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Monthly costs</p>
                    <h2>Cost assumptions</h2>
                  </div>
                </div>
                <div className="form-grid salary-form-grid">
                  <label>
                    <span>Monthly rent</span>
                    <input inputMode="decimal" value={nomadRent} onChange={(event) => setNomadRent(event.target.value)} placeholder="180000" />
                  </label>
                  <label>
                    <span>Other monthly living expenses</span>
                    <input
                      inputMode="decimal"
                      value={nomadLivingExpenses}
                      onChange={(event) => setNomadLivingExpenses(event.target.value)}
                      placeholder="220000"
                    />
                  </label>
                  <label>
                    <span>Desired monthly savings target</span>
                    <input
                      inputMode="decimal"
                      value={nomadSavingsTarget}
                      onChange={(event) => setNomadSavingsTarget(event.target.value)}
                      placeholder="120000"
                    />
                  </label>
                  <label>
                    <span>Extra monthly buffer</span>
                    <input inputMode="decimal" value={nomadBuffer} onChange={(event) => setNomadBuffer(event.target.value)} placeholder="60000" />
                  </label>
                </div>
                <div className="salary-savings-grid nomad-cost-grid">
                  <MetricCard label="Rent" value={formatScenarioMoney(nomadPlanner.monthlyCosts.rent, nomadPlanner.scenarioSummary.currencyCode)} tone="neutral" />
                  <MetricCard
                    label="Living expenses"
                    value={formatScenarioMoney(nomadPlanner.monthlyCosts.livingExpenses, nomadPlanner.scenarioSummary.currencyCode)}
                    tone="neutral"
                  />
                  <MetricCard
                    label="Savings target"
                    value={formatScenarioMoney(nomadPlanner.monthlyCosts.savingsTarget, nomadPlanner.scenarioSummary.currencyCode)}
                    tone="positive"
                  />
                  <MetricCard label="Buffer" value={formatScenarioMoney(nomadPlanner.monthlyCosts.buffer, nomadPlanner.scenarioSummary.currencyCode)} tone="warning" />
                </div>
              </section>

              <section className="surface section-card nomad-income-card">
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">Required income</p>
                    <h2>Monthly and yearly targets</h2>
                  </div>
                </div>
                <div className="nomad-target-grid">
                  <article className="target-salary-card inset-surface">
                    <span>Bare minimum to break even</span>
                    <strong>{formatScenarioMoney(nomadPlanner.incomeTargets.breakEvenMonthly, nomadPlanner.scenarioSummary.currencyCode)}</strong>
                    <p className="subtle">
                      {formatAudEquivalent(nomadPlanner.incomeTargets.breakEvenMonthlyAud)} per month •{" "}
                      {formatAudEquivalent(nomadPlanner.incomeTargets.breakEvenYearlyAud)} per year
                    </p>
                  </article>
                  <article className="target-salary-card inset-surface">
                    <span>Comfortable target income</span>
                    <strong>{formatScenarioMoney(nomadPlanner.incomeTargets.comfortableMonthly, nomadPlanner.scenarioSummary.currencyCode)}</strong>
                    <p className="subtle">
                      {formatAudEquivalent(nomadPlanner.incomeTargets.comfortableMonthlyAud)} per month •{" "}
                      {formatAudEquivalent(nomadPlanner.incomeTargets.comfortableYearlyAud)} per year, including savings
                    </p>
                  </article>
                  <article className="target-salary-card inset-surface">
                    <span>Stretch / safer target</span>
                    <strong>{formatScenarioMoney(nomadPlanner.incomeTargets.saferMonthly, nomadPlanner.scenarioSummary.currencyCode)}</strong>
                    <p className="subtle">
                      {formatAudEquivalent(nomadPlanner.incomeTargets.saferMonthlyAud)} per month •{" "}
                      {formatAudEquivalent(nomadPlanner.incomeTargets.saferYearlyAud)} per year, including buffer
                    </p>
                  </article>
                </div>
                <div className="runway-banner">
                  Total monthly target: {formatScenarioMoney(nomadPlanner.monthlyCosts.safer, nomadPlanner.scenarioSummary.currencyCode)} with rent,
                  living costs, savings, and buffer included. That is roughly {formatAudEquivalent(nomadPlanner.incomeTargets.saferMonthlyAud)}.
                </div>
              </section>
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
