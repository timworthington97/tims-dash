import { STORAGE_KEY } from "@/lib/constants";
import type { BankHistoryEntry, PortfolioAppState } from "@/lib/types";

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

export function savePortfolioState(state: PortfolioAppState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
