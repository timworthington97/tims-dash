import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

interface OpenExchangeResponse {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

function cleanCurrency(value: string | null) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

async function fetchFrankfurter(from: string, to: string) {
  const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!response.ok) {
    throw new Error(`Frankfurter returned ${response.status}`);
  }

  const payload = (await response.json()) as FrankfurterResponse;
  const rate = payload.rates?.[to];
  if (!Number.isFinite(rate)) {
    throw new Error("Frankfurter did not return an AUD rate.");
  }

  return {
    rate,
    date: payload.date ?? new Date().toISOString(),
    source: "Frankfurter / ECB daily rate",
  };
}

async function fetchOpenExchange(from: string, to: string) {
  const response = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!response.ok) {
    throw new Error(`Open ER API returned ${response.status}`);
  }

  const payload = (await response.json()) as OpenExchangeResponse;
  const rate = payload.rates?.[to];
  if (payload.result !== "success" || !Number.isFinite(rate)) {
    throw new Error("Open ER API did not return an AUD rate.");
  }

  return {
    rate,
    date: payload.time_last_update_utc ?? new Date().toISOString(),
    source: "open.er-api.com daily fallback",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = cleanCurrency(url.searchParams.get("from"));
  const to = cleanCurrency(url.searchParams.get("to")) || "AUD";

  if (!from || !to) {
    return NextResponse.json({ error: "Provide from and to currency codes." }, { status: 400 });
  }

  if (from === to) {
    return NextResponse.json({
      from,
      to,
      rate: 1,
      date: new Date().toISOString(),
      source: "Same currency",
    });
  }

  try {
    const result = await fetchFrankfurter(from, to);
    return NextResponse.json({ from, to, ...result });
  } catch (primaryError) {
    try {
      const result = await fetchOpenExchange(from, to);
      return NextResponse.json({ from, to, ...result });
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : primaryError instanceof Error
            ? primaryError.message
            : "Could not fetch exchange rate.";
      return NextResponse.json({ error: message, from, to }, { status: 502 });
    }
  }
}
