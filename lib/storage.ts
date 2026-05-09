import { STORAGE_KEY } from "@/lib/constants";
import type { BankHistoryEntry, PortfolioAppState } from "@/lib/types";

const STORAGE_META_KEY = `${STORAGE_KEY}:meta`;

export interface PortfolioStateMeta {
  updatedAt: string | null;
}

function normalizeBankHistoryEntry(entry: BankHistoryEntry): BankHistoryEntry {
  const accountName = typeof entry.accountName === "string" && entry.accountName.trim() ? entry.accountName.trim() : "Bank account";
  const accountId = typeof entry.accountId === "string" ? entry.accountId.trim() : "";

  return {
    ...entry,
    accountName,
    accountId,
  };
}

export function normalizePortfolioState(state: PortfolioAppState): PortfolioAppState {
  return {
    holdings: Array.isArray(state.holdings) ? state.holdings : [],
    prices: state.prices ?? {},
    snapshots: Array.isArray(state.snapshots) ? state.snapshots : [],
    lastRefreshedAt: state.lastRefreshedAt ?? null,
    lastViewedAt: state.lastViewedAt ?? null,
    previousViewedAt: state.previousViewedAt ?? null,
    incomes: Array.isArray(state.incomes) ? state.incomes : [],
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    bankHistory: Array.isArray(state.bankHistory) ? state.bankHistory.map((entry) => normalizeBankHistoryEntry(entry as BankHistoryEntry)) : [],
    scenarios: Array.isArray(state.scenarios) ? state.scenarios : [],
  };
}

function timestampValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function collectEntryUpdatedAt(entry: { createdAt?: string; updatedAt?: string }) {
  return Math.max(timestampValue(entry.updatedAt), timestampValue(entry.createdAt));
}

export function getPortfolioDataUpdatedAt(state: PortfolioAppState | null) {
  if (!state) {
    return 0;
  }

  return Math.max(
    timestampValue(state.lastRefreshedAt),
    ...state.holdings.map(collectEntryUpdatedAt),
    ...state.incomes.map(collectEntryUpdatedAt),
    ...state.expenses.map(collectEntryUpdatedAt),
    ...state.bankHistory.map(collectEntryUpdatedAt),
    ...state.scenarios.map(collectEntryUpdatedAt),
    ...state.snapshots.map((snapshot) => timestampValue(snapshot.timestamp)),
  );
}

export function loadPortfolioState(): PortfolioAppState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizePortfolioState(JSON.parse(raw) as PortfolioAppState);
  } catch {
    return null;
  }
}

export function loadPortfolioStateMeta(): PortfolioStateMeta {
  if (typeof window === "undefined") {
    return { updatedAt: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_META_KEY);
    if (!raw) {
      return { updatedAt: null };
    }

    const parsed = JSON.parse(raw) as PortfolioStateMeta;
    return {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return { updatedAt: null };
  }
}

export function savePortfolioState(state: PortfolioAppState, meta?: PortfolioStateMeta) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.localStorage.setItem(
    STORAGE_META_KEY,
    JSON.stringify({
      updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    } satisfies PortfolioStateMeta),
  );
}
