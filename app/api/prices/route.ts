import { NextResponse } from "next/server";
import { fetchBatchPrices } from "@/lib/pricing/service";
import type { PriceRequestItem, PricingResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { holdings?: PriceRequestItem[] };
    const holdings = Array.isArray(body.holdings) ? body.holdings : [];

    if (!holdings.length) {
      return NextResponse.json<PricingResponse>({
        prices: [],
        summary: {
          requested: 0,
          updated: 0,
          failed: 0,
          timedOut: false,
          durationMs: 0,
        },
      });
    }

    const { prices, summary } = await fetchBatchPrices(holdings);
    return NextResponse.json<PricingResponse>({ prices, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected pricing error";
    return NextResponse.json<PricingResponse>(
      {
        error: message,
        prices: [],
        summary: {
          requested: 0,
          updated: 0,
          failed: 0,
          timedOut: true,
          durationMs: 0,
        },
      },
      { status: 500 },
    );
  }
}
