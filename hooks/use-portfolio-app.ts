"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SAMPLE_BANK_HISTORY, SAMPLE_EXPENSES, SAMPLE_HOLDINGS, SAMPLE_INCOMES, SAMPLE_SCENARIOS, SNAPSHOT_HISTORY_LIMIT } from "@/lib/constants";
import { loadCloudPortfolioState, saveCloudPortfolioState } from "@/lib/cloud-storage";
import { CLIENT_REFRESH_TIMEOUT_MS } from "@/lib/pricing/utils";
import { buildRefreshInsight, calculatePortfolioView, createSnapshot, deriveDisplayPrices, makePriceRequestItems } from "@/lib/portfolio";
import { getPortfolioDataUpdatedAt, loadPortfolioState, loadPortfolioStateMeta, savePortfolioState } from "@/lib/storage";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import type {
  BankHistoryEntry,
  ExpenseEntry,
  Holding,
  IncomeEntry,
  PortfolioAppState,
  PricingResponse,
  RefreshInsight,
  RefreshSummary,
  Scenario,
} from "@/lib/types";

type CloudSaveRequest = {
  userId: string;
  state: PortfolioAppState;
  options: {
    importedLocalData: boolean;
    setupComplete: boolean;
  };
};

type PortfolioStateUpdater = (current: PortfolioAppState) => PortfolioAppState;

const defaultState: PortfolioAppState = {
  holdings: [],
  prices: {},
  snapshots: [],
  lastRefreshedAt: null,
  lastViewedAt: null,
  previousViewedAt: null,
  incomes: [],
  expenses: [],
  bankHistory: [],
  scenarios: [],
};

function hasMeaningfulState(state: PortfolioAppState) {
  return Boolean(
    state.holdings.length ||
      state.incomes.length ||
      state.expenses.length ||
      state.bankHistory.length ||
      state.snapshots.length ||
      Object.keys(state.prices).length,
  );
}

function durableStateFingerprint(state: PortfolioAppState | null) {
  if (!state) {
    return "";
  }

  return JSON.stringify({
    holdings: state.holdings,
    prices: state.prices,
    snapshots: state.snapshots,
    lastRefreshedAt: state.lastRefreshedAt,
    incomes: state.incomes,
    expenses: state.expenses,
    bankHistory: state.bankHistory,
    scenarios: state.scenarios,
  });
}

function isLocalStateNewer(local: PortfolioAppState | null, remote: PortfolioAppState | null, remoteSavedAt?: string | null) {
  if (!local || !hasMeaningfulState(local)) {
    return false;
  }

  const localMetaUpdatedAt = new Date(loadPortfolioStateMeta().updatedAt ?? "").getTime();
  const remoteSavedAtTime = new Date(remoteSavedAt ?? "").getTime();
  const localDataUpdatedAt = getPortfolioDataUpdatedAt(local);
  const remoteDataUpdatedAt = getPortfolioDataUpdatedAt(remote);
  const skewMs = 1000;

  if (localDataUpdatedAt && localDataUpdatedAt > remoteDataUpdatedAt + skewMs) {
    return true;
  }

  return Boolean(
    Number.isFinite(localMetaUpdatedAt) &&
      Number.isFinite(remoteSavedAtTime) &&
      localMetaUpdatedAt > remoteSavedAtTime + skewMs &&
      durableStateFingerprint(local) !== durableStateFingerprint(remote),
  );
}

function canWriteCloudFromCurrentOrigin() {
  if (process.env.NEXT_PUBLIC_ENABLE_LOCAL_CLOUD_WRITES === "true") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function usePortfolioApp() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const cloudWritesAllowed = useMemo(() => canWriteCloudFromCurrentOrigin(), []);
  const [state, setState] = useState<PortfolioAppState>(defaultState);
  const stateRef = useRef<PortfolioAppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "loading">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null);
  const [refreshInsight, setRefreshInsight] = useState<RefreshInsight | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const cloudReadyRef = useRef(false);
  const pendingImportRef = useRef<PortfolioAppState | null>(null);
  const queuedCloudSaveRef = useRef<CloudSaveRequest | null>(null);
  const cloudSaveInFlightRef = useRef(false);
  const cloudSaveTimerRef = useRef<number | null>(null);

  const replaceState = useCallback((nextState: PortfolioAppState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const flushCloudSaveQueue = useCallback(async () => {
    if (!client || cloudSaveInFlightRef.current) {
      return;
    }

    const request = queuedCloudSaveRef.current;
    if (!request) {
      return;
    }

    queuedCloudSaveRef.current = null;
    cloudSaveInFlightRef.current = true;
    let saved = false;

    try {
      await saveCloudPortfolioState(client, request.userId, request.state, request.options);
      saved = true;
      setSyncError(null);
    } catch (error) {
      queuedCloudSaveRef.current = queuedCloudSaveRef.current ?? request;
      setSyncError(error instanceof Error ? error.message : "Could not sync your data.");
    } finally {
      cloudSaveInFlightRef.current = false;
      if (saved && queuedCloudSaveRef.current) {
        window.setTimeout(() => {
          void flushCloudSaveQueue();
        }, 0);
      }
    }
  }, [client]);

  const queueCloudSave = useCallback(
    (request: CloudSaveRequest, delayMs = 350) => {
      queuedCloudSaveRef.current = request;

      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }

      cloudSaveTimerRef.current = window.setTimeout(() => {
        cloudSaveTimerRef.current = null;
        void flushCloudSaveQueue();
      }, delayMs);
    },
    [flushCloudSaveQueue],
  );

  const persistStateImmediately = useCallback(
    (nextState: PortfolioAppState) => {
      savePortfolioState(nextState);

      if (!client || !session || !cloudWritesAllowed || !cloudReadyRef.current || showImportPrompt) {
        return;
      }

      queueCloudSave(
        {
          userId: session.user.id,
          state: nextState,
          options: {
            importedLocalData: false,
            setupComplete: true,
          },
        },
        0,
      );
    },
    [client, cloudWritesAllowed, queueCloudSave, session, showImportPrompt],
  );

  const commitState = useCallback(
    (updater: PortfolioStateUpdater) => {
      const current = stateRef.current;
      const nextState = updater(current);

      if (nextState === current) {
        return;
      }

      replaceState(nextState);
      persistStateImmediately(nextState);
    },
    [persistStateImmediately, replaceState],
  );

  useEffect(() => {
    const saved = loadPortfolioState();
    if (saved) {
      replaceState(saved);
      pendingImportRef.current = saved;
    }
    setHydrated(true);

    if (!client) {
      setAuthReady(true);
      return;
    }

    const authReadyTimeout = window.setTimeout(() => {
      setAuthReady(true);
    }, 1500);

    const syncSession = async (nextSession: Session | null) => {
      setSession(nextSession);
      setSyncError(null);

      if (!nextSession) {
        cloudReadyRef.current = false;
        queuedCloudSaveRef.current = null;
        setShowImportPrompt(false);
        const local = loadPortfolioState();
        if (local) {
          replaceState(local);
          pendingImportRef.current = local;
        }
        setAuthReady(true);
        return;
      }

      try {
        const localBeforeCloudLoad = loadPortfolioState();
        const localFingerprintBeforeCloudLoad = durableStateFingerprint(localBeforeCloudLoad);
        const remote = await loadCloudPortfolioState(client, nextSession.user.id);
        const localAfterCloudLoad = loadPortfolioState();
        const localChangedDuringCloudLoad = durableStateFingerprint(localAfterCloudLoad) !== localFingerprintBeforeCloudLoad;

        if (cloudWritesAllowed && localChangedDuringCloudLoad && localAfterCloudLoad && hasMeaningfulState(localAfterCloudLoad)) {
          replaceState(localAfterCloudLoad);
          pendingImportRef.current = localAfterCloudLoad;
          setShowImportPrompt(false);
          cloudReadyRef.current = true;
          return;
        }

        if (remote) {
          const localMeta = loadPortfolioState();
          if (cloudWritesAllowed && localMeta && isLocalStateNewer(localMeta, remote.state, remote.updatedAt)) {
            replaceState(localMeta);
            pendingImportRef.current = localMeta;
            setShowImportPrompt(false);
            cloudReadyRef.current = true;
            return;
          }

          replaceState({
            ...remote.state,
            lastViewedAt: localMeta?.lastViewedAt ?? remote.state.lastViewedAt,
            previousViewedAt: localMeta?.previousViewedAt ?? remote.state.previousViewedAt,
          });
          pendingImportRef.current = remote.state;
          setShowImportPrompt(false);
          cloudReadyRef.current = true;
        } else {
          const local = loadPortfolioState() ?? defaultState;
          pendingImportRef.current = local;
          if (hasMeaningfulState(local)) {
            replaceState(local);
            setShowImportPrompt(cloudWritesAllowed);
            cloudReadyRef.current = false;
          } else if (cloudWritesAllowed) {
            await saveCloudPortfolioState(client, nextSession.user.id, defaultState, {
              importedLocalData: false,
              setupComplete: true,
            });
            replaceState(defaultState);
            setShowImportPrompt(false);
            cloudReadyRef.current = true;
          } else {
            replaceState(defaultState);
            setShowImportPrompt(false);
            cloudReadyRef.current = false;
          }
        }
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not load your synced data.");
      } finally {
        window.clearTimeout(authReadyTimeout);
        setAuthReady(true);
      }
    };

    client.auth.getSession().then(({ data }) => {
      void syncSession(data.session);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      window.clearTimeout(authReadyTimeout);
      data.subscription.unsubscribe();
    };
  }, [client, cloudWritesAllowed, replaceState]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    savePortfolioState(state);

    if (!client || !session || !cloudWritesAllowed || !cloudReadyRef.current || showImportPrompt) {
      return;
    }

    queueCloudSave({
      userId: session.user.id,
      state,
      options: {
        importedLocalData: false,
        setupComplete: true,
      },
    });
  }, [client, cloudWritesAllowed, hydrated, queueCloudSave, session, showImportPrompt, state]);

  useEffect(
    () => () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    },
    [],
  );

  const saveHolding = (holding: Holding) => {
    setLastError(null);
    commitState((current) => {
      const exists = current.holdings.some((item) => item.id === holding.id);
      return {
        ...current,
        holdings: exists
          ? current.holdings.map((item) => (item.id === holding.id ? holding : item))
          : [...current.holdings, holding],
      };
    });
  };

  const deleteHolding = (id: string) => {
    setLastError(null);
    commitState((current) => {
      const nextPrices = { ...current.prices };
      delete nextPrices[id];
      return {
        ...current,
        holdings: current.holdings.filter((holding) => holding.id !== id),
        prices: nextPrices,
      };
    });
  };

  const saveIncome = (entry: IncomeEntry) => {
    commitState((current) => {
      const exists = current.incomes.some((item) => item.id === entry.id);
      return {
        ...current,
        incomes: exists ? current.incomes.map((item) => (item.id === entry.id ? entry : item)) : [...current.incomes, entry],
      };
    });
  };

  const deleteIncome = (id: string) => {
    commitState((current) => ({
      ...current,
      incomes: current.incomes.filter((entry) => entry.id !== id),
    }));
  };

  const saveExpense = (entry: ExpenseEntry) => {
    commitState((current) => {
      const exists = current.expenses.some((item) => item.id === entry.id);
      return {
        ...current,
        expenses: exists ? current.expenses.map((item) => (item.id === entry.id ? entry : item)) : [...current.expenses, entry],
      };
    });
  };

  const deleteExpense = (id: string) => {
    commitState((current) => ({
      ...current,
      expenses: current.expenses.filter((entry) => entry.id !== id),
    }));
  };

  const saveBankHistoryEntry = (entry: BankHistoryEntry) => {
    commitState((current) => {
      const exists = current.bankHistory.some((item) => item.id === entry.id);
      return {
        ...current,
        bankHistory: exists
          ? current.bankHistory.map((item) => (item.id === entry.id ? entry : item))
          : [...current.bankHistory, entry],
      };
    });
  };

  const deleteBankHistoryEntry = (id: string) => {
    commitState((current) => ({
      ...current,
      bankHistory: current.bankHistory.filter((entry) => entry.id !== id),
    }));
  };

  const saveScenario = (entry: Scenario) => {
    commitState((current) => {
      const exists = current.scenarios.some((item) => item.id === entry.id);
      return {
        ...current,
        scenarios: exists ? current.scenarios.map((item) => (item.id === entry.id ? entry : item)) : [...current.scenarios, entry],
      };
    });
  };

  const deleteScenario = (id: string) => {
    commitState((current) => ({
      ...current,
      scenarios: current.scenarios.filter((entry) => entry.id !== id),
    }));
  };

  const deleteSnapshot = (id: string) => {
    commitState((current) => ({
      ...current,
      snapshots: current.snapshots.filter((snapshot) => snapshot.id !== id),
    }));
  };

  const clearSnapshots = () => {
    commitState((current) => ({
      ...current,
      snapshots: [],
    }));
  };

  const loadSampleData = (holdings: readonly Holding[] = SAMPLE_HOLDINGS) => {
    const seeded = holdings.map((holding) => ({ ...holding }));
    commitState((current) => ({
      holdings: seeded,
      prices: {},
      snapshots: [],
      lastRefreshedAt: null,
      lastViewedAt: current.lastViewedAt,
      previousViewedAt: current.previousViewedAt,
      incomes: SAMPLE_INCOMES.map((item) => ({ ...item })),
      expenses: SAMPLE_EXPENSES.map((item) => ({ ...item })),
      bankHistory: SAMPLE_BANK_HISTORY.map((item) => ({ ...item })),
      scenarios: SAMPLE_SCENARIOS.map((item) => ({ ...item })),
    }));
    setLastError(null);
    setDemoMessage("Sample portfolio loaded. Press refresh to fetch prices and create your first snapshot.");
  };

  const clearDemoMessage = () => setDemoMessage(null);

  const markDashboardViewed = useCallback(() => {
    commitState((current) => {
      const now = Date.now();
      const currentViewedAt = current.lastViewedAt ? new Date(current.lastViewedAt).getTime() : null;

      if (currentViewedAt && Number.isFinite(currentViewedAt) && now - currentViewedAt < 5 * 60 * 1000) {
        return current;
      }

      return {
        ...current,
        previousViewedAt: current.lastViewedAt ?? current.previousViewedAt,
        lastViewedAt: new Date(now).toISOString(),
      };
    });
  }, [commitState]);

  const signInWithPassword = async (email: string, password: string) => {
    if (!client) {
      return false;
    }

    setAuthMessage(null);
    setSyncError(null);

    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setSyncError(error.message);
      return false;
    }

    setAuthMessage("Signed in. You will stay signed in on this device until you sign out.");
    return true;
  };

  const signUpWithPassword = async (email: string, password: string) => {
    if (!client) {
      return false;
    }

    setAuthMessage(null);
    setSyncError(null);

    const { error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) {
      setSyncError(error.message);
      return false;
    }

    setAuthMessage("Account created. If email confirmation is enabled in Supabase, confirm once and then sign in with your password.");
    return true;
  };

  const signOut = async () => {
    if (!client) {
      return;
    }

    const { error } = await client.auth.signOut();
    if (error) {
      setSyncError(error.message);
      return;
    }

    setAuthMessage(null);
  };

  const importLocalToCloud = async () => {
    if (!client || !session) {
      return;
    }

    if (!cloudWritesAllowed) {
      setAuthMessage("Local development is cloud read-only, so test data was not imported to Supabase.");
      return;
    }

    const source = pendingImportRef.current ?? state;
    await saveCloudPortfolioState(client, session.user.id, source, {
      importedLocalData: true,
      setupComplete: true,
    });
    replaceState(source);
    setShowImportPrompt(false);
    cloudReadyRef.current = true;
    setAuthMessage("Local data imported to your private cloud sync.");
  };

  const startFreshCloud = async () => {
    if (!client || !session) {
      return;
    }

    if (!cloudWritesAllowed) {
      setAuthMessage("Local development is cloud read-only, so your Supabase data was not reset.");
      return;
    }

    await saveCloudPortfolioState(client, session.user.id, defaultState, {
      importedLocalData: false,
      setupComplete: true,
    });
    replaceState(defaultState);
    setShowImportPrompt(false);
    cloudReadyRef.current = true;
    setAuthMessage("Started with a fresh private cloud profile.");
  };

  const refreshPortfolio = async () => {
    if (!state.holdings.length) {
      setLastError("Add at least one holding before refreshing.");
      return;
    }

    setRefreshState("loading");
    setLastError(null);
    setDemoMessage(null);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), CLIENT_REFRESH_TIMEOUT_MS);
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          holdings: makePriceRequestItems(state.holdings),
        }),
      }).finally(() => window.clearTimeout(timeout));

      const payload = (await response.json()) as PricingResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refresh prices right now.");
      }

      const mergedPrices = deriveDisplayPrices(state.prices, payload.prices ?? []);
      const insightPrices = { ...mergedPrices };
      (payload.prices ?? []).forEach((price) => {
        if (price.status !== "stale") {
          return;
        }

        const existing = state.prices[price.holdingId];
        if (existing) {
          insightPrices[price.holdingId] = existing;
          return;
        }

        delete insightPrices[price.holdingId];
      });
      const previousView = calculatePortfolioView(state.holdings, state.prices, state.snapshots);
      const pricedView = calculatePortfolioView(state.holdings, mergedPrices, state.snapshots);
      const insightView = calculatePortfolioView(state.holdings, insightPrices, state.snapshots);
      const snapshot = createSnapshot(pricedView.holdings, new Date().toISOString());
      setRefreshSummary(payload.summary);
      setRefreshInsight(buildRefreshInsight(previousView, insightView, payload.summary, payload.prices ?? []));

      commitState((current) => ({
        ...current,
        prices: mergedPrices,
        snapshots: [...current.snapshots, snapshot].slice(-SNAPSHOT_HISTORY_LIMIT),
        lastRefreshedAt: snapshot.timestamp,
      }));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setLastError("Refresh took too long, so it was stopped. Try again in a moment.");
      } else {
        setLastError(error instanceof Error ? error.message : "Unable to refresh prices right now.");
      }
      setRefreshSummary({
        requested: makePriceRequestItems(state.holdings).length,
        updated: 0,
        failed: makePriceRequestItems(state.holdings).length,
        timedOut: true,
        durationMs: CLIENT_REFRESH_TIMEOUT_MS,
      });
      setRefreshInsight(null);
    } finally {
      setRefreshState("idle");
    }
  };

  return {
    holdings: state.holdings,
    prices: state.prices,
    snapshots: state.snapshots,
    lastRefreshedAt: state.lastRefreshedAt,
    lastViewedAt: state.lastViewedAt,
    previousViewedAt: state.previousViewedAt,
    incomes: state.incomes,
    expenses: state.expenses,
    bankHistory: state.bankHistory,
    scenarios: state.scenarios,
    refreshState,
    lastError,
    demoMessage,
    refreshSummary,
    refreshInsight,
    saveHolding,
    deleteHolding,
    saveIncome,
    deleteIncome,
    saveExpense,
    deleteExpense,
    saveBankHistoryEntry,
    deleteBankHistoryEntry,
    saveScenario,
    deleteScenario,
    deleteSnapshot,
    clearSnapshots,
    refreshPortfolio,
    loadSampleData,
    clearDemoMessage,
    markDashboardViewed,
    hasSupabase: hasSupabaseConfig(),
    cloudWritesAllowed,
    isSignedIn: Boolean(session),
    authReady,
    userEmail: session?.user.email ?? null,
    authMessage,
    syncError,
    showImportPrompt,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    importLocalToCloud,
    startFreshCloud,
  };
}
