import { GLOBAL_REFRESH_TIMEOUT_MS, ITEM_TIMEOUT_MS, fetchWithTimeout, wait, withRetry } from "@/lib/pricing/utils";
import type { PriceRequestItem, PriceRequestResult, RefreshSummary } from "@/lib/types";

const pricingMode = process.env.PRICING_MODE ?? "auto";
const twelveApiKey = process.env.TWELVE_DATA_API_KEY;
const fxCache = new Map<string, number>();
const supportedAsxEtfs = new Set(["ETHI", "HACK", "ASIA"]);
const sharedFetchHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const coingeckoSymbolMap: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  ada: "cardano",
  xrp: "ripple",
  doge: "dogecoin",
  usdt: "tether",
  usdc: "usd-coin",
  bnb: "binancecoin",
};

function mockPrice(symbol: string) {
  return Array.from(symbol.toUpperCase()).reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.91;
}

async function getFxRate(fromCurrency: string) {
  const from = fromCurrency.toUpperCase();
  if (from === "AUD") {
    return 1;
  }

  if (fxCache.has(from)) {
    return fxCache.get(from) ?? 1;
  }

  const response = await fetchWithTimeout(
    `https://api.frankfurter.app/latest?from=${from}&to=AUD`,
    {
      next: { revalidate: 300 },
      headers: sharedFetchHeaders,
    },
    ITEM_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`FX conversion failed for ${from}/AUD.`);
  }
  const data = (await response.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.AUD;

  if (!rate) {
    throw new Error(`Missing FX rate for ${from}/AUD.`);
  }

  fxCache.set(from, rate);
  return rate;
}

async function fetchTwelveDataEtf(symbol: string) {
  if (!twelveApiKey) {
    throw new Error("Missing Twelve Data API key.");
  }

  const response = await fetchWithTimeout(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(twelveApiKey)}`,
    { cache: "no-store", headers: sharedFetchHeaders },
    ITEM_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Twelve Data quote failed for ${symbol}.`);
  }

  const data = (await response.json()) as { close?: string; currency?: string; symbol?: string; message?: string; status?: string };
  if (!data.close) {
    throw new Error(data.message ?? `No Twelve Data quote found for ${symbol}.`);
  }

  return {
    symbol: data.symbol ?? symbol,
    currency: data.currency ?? (symbol.endsWith(".AX") ? "AUD" : "USD"),
    price: Number(data.close),
  };
}

async function fetchStockAnalysisAsxQuote(symbol: string) {
  const cleaned = symbol.replace(/\.AX$/i, "").trim().toUpperCase();
  const response = await fetchWithTimeout(
    `https://stockanalysis.com/quote/asx/${encodeURIComponent(cleaned)}/`,
    {
      cache: "no-store",
      headers: sharedFetchHeaders,
    },
    ITEM_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`StockAnalysis quote failed for ${cleaned}.`);
  }

  const html = await response.text();
  const quoteBlockPattern = /quote:\{([\s\S]*?)\},archived:false/;
  const blockMatch = html.match(quoteBlockPattern);
  const block = blockMatch?.[1] ?? "";

  if (!block || !block.includes(`symbol:"${cleaned.toLowerCase()}.ax"`)) {
    throw new Error(`No ASX fallback quote found for ${cleaned}.`);
  }
  const extractString = (key: string) => {
    const match = block.match(new RegExp(`${key}:"([^"]+)"`));
    return match?.[1] ?? null;
  };
  const extractNumber = (key: string) => {
    const match = block.match(new RegExp(`${key}:([^,]+)`));
    return match?.[1] ? Number(match[1]) : Number.NaN;
  };

  const currentPrice = extractNumber("p");
  const updatedLabel = extractString("u");
  const marketState = extractString("ms");
  const providerSymbol = extractString("symbol");

  if (!Number.isFinite(currentPrice) || !updatedLabel || !marketState || !providerSymbol) {
    throw new Error(`Invalid ASX fallback price for ${cleaned}.`);
  }

  return {
    symbol: providerSymbol.toUpperCase(),
    currency: "AUD",
    price: currentPrice,
    source: "StockAnalysis",
    status: "delayed" as const,
    statusText: "Delayed market price",
    detailText: marketState === "closed" ? `Market closed • ${updatedLabel}` : updatedLabel,
  };
}

async function resolveEtfQuote(symbol: string, market?: string) {
  const base = symbol.toUpperCase().trim();
  const marketUpper = market?.trim().toUpperCase();
  const normalized = base.replace(/\.AX$/i, "");
  const isAsx = !marketUpper || marketUpper === "ASX" || base.endsWith(".AX");
  const errors: string[] = [];

  if (isAsx && supportedAsxEtfs.has(normalized)) {
    try {
      const stockAnalysisQuote = await withRetry(() => fetchStockAnalysisAsxQuote(normalized), 2);
      return {
        symbol: stockAnalysisQuote.symbol,
        unitPriceAud: stockAnalysisQuote.price,
        quoteCurrency: stockAnalysisQuote.currency,
        originalUnitPrice: stockAnalysisQuote.price,
        source: stockAnalysisQuote.source,
        status: stockAnalysisQuote.status,
        statusText: stockAnalysisQuote.statusText,
        detailText: stockAnalysisQuote.detailText,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `ASX fallback failed for ${normalized}.AX`);
    }
  }

  if (twelveApiKey) {
    try {
      const quote = await withRetry(
        () => fetchTwelveDataEtf(isAsx ? `${normalized}.AX` : base),
        2,
      );
      const fxRate = await getFxRate(quote.currency);
      return {
        symbol: quote.symbol,
        unitPriceAud: quote.price * fxRate,
        quoteCurrency: quote.currency,
        originalUnitPrice: quote.price,
        source: twelveApiKey ? "Twelve Data" : "Yahoo Finance",
        status: "live" as const,
        statusText: "Live market price",
        detailText: quote.currency === "AUD" ? "Quoted in AUD" : `Converted from ${quote.currency} to AUD`,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Fallback ETF provider failed for ${base}`);
    }
  }

  if (isAsx && !supportedAsxEtfs.has(normalized)) {
    errors.push(`No supported live ETF provider is configured for ${normalized}.AX.`);
  }

  throw new Error(errors[errors.length - 1] ?? `Unable to price ETF ${base}.`);
}

async function resolveCoinId(symbol: string) {
  const normalized = symbol.trim().toLowerCase();
  if (coingeckoSymbolMap[normalized]) {
    return coingeckoSymbolMap[normalized];
  }

  const response = await fetchWithTimeout(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalized)}`,
    {
      next: { revalidate: 300 },
      headers: sharedFetchHeaders,
    },
    ITEM_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`CoinGecko search failed for ${symbol}.`);
  }

  const data = (await response.json()) as {
    coins?: Array<{ id: string; symbol: string; name: string }>;
  };

  const match =
    data.coins?.find((coin) => coin.symbol.toLowerCase() === normalized) ??
    data.coins?.find((coin) => coin.id.toLowerCase() === normalized) ??
    data.coins?.[0];

  if (!match) {
    throw new Error(`No crypto match found for ${symbol}.`);
  }

  return match.id;
}

async function resolveCryptoQuote(symbol: string) {
  const coinId = await resolveCoinId(symbol);
  const response = await fetchWithTimeout(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=aud`,
    {
      next: { revalidate: 120 },
      headers: sharedFetchHeaders,
    },
    ITEM_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`CoinGecko pricing failed for ${symbol}.`);
  }

  const data = (await response.json()) as Record<string, { aud?: number }>;
  const aud = data[coinId]?.aud;

  if (!aud) {
    throw new Error(`No AUD crypto price found for ${symbol}.`);
  }

  return {
    symbol: symbol.toUpperCase(),
    unitPriceAud: aud,
    quoteCurrency: "AUD",
    originalUnitPrice: aud,
    source: "CoinGecko",
    status: "live" as const,
    statusText: "Live crypto price",
    detailText: "Quoted in AUD",
  };
}

function toMockResult(item: PriceRequestItem, error?: string): PriceRequestResult {
  const mockValue = mockPrice(item.symbol);
  return {
    holdingId: item.holdingId,
    kind: item.kind,
    symbol: item.symbol.toUpperCase(),
    unitPriceAud: mockValue,
    source: "Mock pricing",
    fetchedAt: new Date().toISOString(),
    status: "mock",
    error,
    quoteCurrency: "AUD",
    originalUnitPrice: mockValue,
    statusText: "Demo price",
    detailText: "Used because live pricing is disabled",
  };
}

function buildUserFacingPricingError(item: PriceRequestItem) {
  if (item.kind === "etf") {
    return `Could not fetch live price for ${item.symbol.toUpperCase()}${item.market ? `.${item.market.toUpperCase() === "ASX" ? "AX" : item.market.toUpperCase()}` : ""}.`;
  }

  return `Could not fetch live price for ${item.symbol.toUpperCase()}.`;
}

async function resolveSinglePrice(item: PriceRequestItem): Promise<PriceRequestResult> {
  try {
    if (pricingMode === "mock") {
      return toMockResult(item);
    }

    const quote =
      item.kind === "etf"
        ? await resolveEtfQuote(item.symbol, item.market)
        : await withRetry(() => resolveCryptoQuote(item.symbol), 2);

    return {
      holdingId: item.holdingId,
      kind: item.kind,
      symbol: quote.symbol,
      unitPriceAud: quote.unitPriceAud,
      source: quote.source,
      fetchedAt: new Date().toISOString(),
      status: quote.status,
      quoteCurrency: quote.quoteCurrency,
      originalUnitPrice: quote.originalUnitPrice,
      statusText: quote.statusText,
      detailText: quote.detailText,
    };
  } catch (error) {
    if (pricingMode === "mock") {
      return toMockResult(item, error instanceof Error ? error.message : "Mock fallback used.");
    }

    return {
      holdingId: item.holdingId,
      kind: item.kind,
      symbol: item.symbol.toUpperCase(),
      unitPriceAud: null,
      source: "Unavailable",
      fetchedAt: new Date().toISOString(),
      status: "error",
      error: buildUserFacingPricingError(item),
      quoteCurrency: null,
      originalUnitPrice: null,
      statusText: "Unavailable",
      detailText: error instanceof Error ? error.message : "Pricing provider could not resolve this holding",
    };
  }
}

function buildTimedOutResult(item: PriceRequestItem): PriceRequestResult {
  return {
    holdingId: item.holdingId,
    kind: item.kind,
    symbol: item.symbol.toUpperCase(),
    unitPriceAud: null,
    source: "Unavailable",
    fetchedAt: new Date().toISOString(),
    status: "error",
    error: buildUserFacingPricingError(item),
    quoteCurrency: null,
    originalUnitPrice: null,
    statusText: "Unavailable",
    detailText: "Refresh timed out before this holding could finish updating",
  };
}

export async function fetchBatchPrices(items: PriceRequestItem[]) {
  const startedAt = Date.now();
  const results = new Map<string, PriceRequestResult>();

  const tasks = items.map(async (item) => {
    const result = await resolveSinglePrice(item);
    results.set(item.holdingId, result);
  });

  await Promise.race([
    Promise.allSettled(tasks),
    wait(GLOBAL_REFRESH_TIMEOUT_MS),
  ]);

  const prices = items.map((item) => results.get(item.holdingId) ?? buildTimedOutResult(item));
  const updated = prices.filter((price) => price.status === "live" || price.status === "delayed" || price.status === "mock").length;
  const failed = prices.length - updated;
  const summary: RefreshSummary = {
    requested: prices.length,
    updated,
    failed,
    timedOut: failed > 0 && prices.some((price) => price.detailText?.includes("timed out")),
    durationMs: Date.now() - startedAt,
  };

  return { prices, summary };
}
