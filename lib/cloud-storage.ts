"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePortfolioState } from "@/lib/storage";
import type { PortfolioAppState } from "@/lib/types";

type CloudStateRow = {
  user_id: string;
  holdings: PortfolioAppState["holdings"];
  prices: PortfolioAppState["prices"];
  snapshots: PortfolioAppState["snapshots"];
  incomes: PortfolioAppState["incomes"];
  expenses: PortfolioAppState["expenses"];
  bank_history: PortfolioAppState["bankHistory"];
  scenarios: PortfolioAppState["scenarios"];
  last_refreshed_at: string | null;
  setup_complete: boolean;
  imported_local_data: boolean;
};

function toCloudRow(userId: string, state: PortfolioAppState, options?: { importedLocalData?: boolean; setupComplete?: boolean }): CloudStateRow {
  return {
    user_id: userId,
    holdings: state.holdings,
    prices: state.prices,
    snapshots: state.snapshots,
    incomes: state.incomes,
    expenses: state.expenses,
    bank_history: state.bankHistory,
    scenarios: state.scenarios,
    last_refreshed_at: state.lastRefreshedAt,
    setup_complete: options?.setupComplete ?? true,
    imported_local_data: options?.importedLocalData ?? false,
  };
}

function fromCloudRow(row: CloudStateRow): PortfolioAppState {
  return normalizePortfolioState({
    holdings: row.holdings,
    prices: row.prices,
    snapshots: row.snapshots,
    lastRefreshedAt: row.last_refreshed_at,
    lastViewedAt: null,
    previousViewedAt: null,
    incomes: row.incomes,
    expenses: row.expenses,
    bankHistory: row.bank_history,
    scenarios: row.scenarios,
  });
}

export async function loadCloudPortfolioState(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("user_dashboard_state").select("*").eq("user_id", userId).maybeSingle<CloudStateRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    state: fromCloudRow(data),
    importedLocalData: data.imported_local_data,
    setupComplete: data.setup_complete,
  };
}

export async function saveCloudPortfolioState(
  client: SupabaseClient,
  userId: string,
  state: PortfolioAppState,
  options?: { importedLocalData?: boolean; setupComplete?: boolean },
) {
  const row = toCloudRow(userId, state, options);
  const { error } = await client.from("user_dashboard_state").upsert(row, { onConflict: "user_id" });
  if (error) {
    throw error;
  }
}
