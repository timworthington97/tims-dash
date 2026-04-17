import { STORAGE_KEY } from "@/lib/constants";
import type { PortfolioAppState } from "@/lib/types";

export function normalizePortfolioState(state: PortfolioAppState): PortfolioAppState {
  return {
    holdings: Array.isArray(state.holdings) ? state.holdings : [],
    prices: state.prices ?? {},
    snapshots: Array.isArray(state.snapshots) ? state.snapshots : [],
    lastRefreshedAt: state.lastRefreshedAt ?? null,
    incomes: Array.isArray(state.incomes) ? state.incomes : [],
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    bankHistory: Array.isArray(state.bankHistory) ? state.bankHistory : [],
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
