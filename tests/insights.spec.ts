import { expect, test } from "@playwright/test";

const SEEDED_STATE = {
  holdings: [
    {
      id: "cash-1",
      type: "cash",
      name: "UBank Everyday",
      amountAud: 18250,
      notes: "Main cash reserve",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "etf-1",
      type: "etf",
      name: "BetaShares Global Sustainability Leaders ETF",
      ticker: "ETHI",
      units: 124,
      market: "ASX",
      notes: "Long-term core ETF",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "crypto-1",
      type: "crypto",
      name: "Bitcoin",
      symbol: "BTC",
      amount: 0.245,
      notes: "Cold wallet",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  prices: {},
  snapshots: [
    {
      id: "snapshot-1",
      timestamp: "2026-04-15T07:30:00.000Z",
      totalNetWorth: 25000,
      totalLiquidValue: 21000,
      totalCash: 17000,
      totalEtfValue: 2500,
      totalCryptoValue: 1500,
      totalDebtValue: 0,
      status: "success",
      failedHoldings: 0,
    },
  ],
  lastRefreshedAt: "2026-04-15T07:30:00.000Z",
  lastViewedAt: "2026-04-18T07:30:00.000Z",
  previousViewedAt: "2026-04-15T07:30:00.000Z",
  incomes: [
    {
      id: "income-1",
      name: "Salary",
      amount: 7800,
      frequency: "monthly",
      notes: "After tax",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  expenses: [
    {
      id: "expense-1",
      name: "Rent",
      amount: 2650,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  bankHistory: [
    {
      id: "bank-history-4",
      name: "Feb 2026",
      month: "2026-02",
      endingBalanceAud: 16940,
      accountName: "UBank Everyday",
      accountId: "0740",
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "bank-history-5",
      name: "Mar 2026",
      month: "2026-03",
      endingBalanceAud: 17610,
      accountName: "UBank Everyday",
      accountId: "0740",
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  scenarios: [],
};

test("insights card renders a calm dashboard briefing and responds to refresh", async ({ page }) => {
  await page.route("https://ufttpghwfhrxmhcqynhj.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Auth session missing!" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/");
  await page.waitForTimeout(1200);
  await page.evaluate((state) => {
    window.localStorage.setItem("lattice-wealth-state", JSON.stringify(state));
  }, SEEDED_STATE);
  await page.reload();

  await expect(page.getByText("Insights")).toBeVisible();
  await expect(page.locator(".insights-summary")).toContainText("Since your last check");
  await expect(page.getByText("Suggested next action")).toBeVisible();
  await expect(page.getByText("High confidence").or(page.getByText("Medium confidence")).or(page.getByText("Low confidence"))).toBeVisible();

  const summaryBefore = await page.locator(".insights-summary").textContent();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".refresh-lines")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  const summaryAfter = await page.locator(".insights-summary").textContent();
  expect(summaryAfter).toBeTruthy();
  expect(summaryBefore).not.toBe(summaryAfter);
});
