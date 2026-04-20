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
      id: "etf-2",
      type: "etf",
      name: "BetaShares Global Cybersecurity ETF",
      ticker: "HACK",
      units: 76,
      market: "ASX",
      notes: "Thematic exposure",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "etf-3",
      type: "etf",
      name: "BetaShares Asia Technology Tigers ETF",
      ticker: "ASIA",
      units: 64,
      market: "ASX",
      notes: "",
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
    {
      id: "crypto-2",
      type: "crypto",
      name: "Ethereum",
      symbol: "ETH",
      amount: 1.95,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "debt-1",
      type: "debt",
      name: "Credit card balance",
      amountAud: 1320,
      notes: "Paid monthly",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "asset-1",
      type: "manualAsset",
      name: "Car",
      valueAud: 16800,
      notes: "Estimated resale value",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  prices: {},
  snapshots: [],
  lastRefreshedAt: null,
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
    {
      id: "income-2",
      name: "Freelance project",
      amount: 2400,
      frequency: "oneOff",
      notes: "Expected next month",
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
    {
      id: "expense-2",
      name: "Living costs",
      amount: 1850,
      notes: "Groceries, utilities, transport",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  bankHistory: [
    {
      id: "bank-history-1",
      name: "Nov 2025",
      month: "2025-11",
      endingBalanceAud: 14320,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "bank-history-2",
      name: "Dec 2025",
      month: "2025-12",
      endingBalanceAud: 15140,
      notes: "Holiday spending month",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "bank-history-3",
      name: "Jan 2026",
      month: "2026-01",
      endingBalanceAud: 16220,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "bank-history-4",
      name: "Feb 2026",
      month: "2026-02",
      endingBalanceAud: 16940,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
    {
      id: "bank-history-5",
      name: "Mar 2026",
      month: "2026-03",
      endingBalanceAud: 17610,
      notes: "",
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    },
  ],
  scenarios: [],
};

test("dashboard, pricing, bank views, history tools, and persistence all work", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
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

  const theme = await page.evaluate(() => {
    const frame = document.querySelector(".app-frame");
    const styles = frame ? window.getComputedStyle(frame) : null;
    return {
      hasFrame: Boolean(frame),
      backgroundColor: window.getComputedStyle(document.body).backgroundColor,
      borderRadius: styles?.borderRadius ?? null,
    };
  });

  expect(theme.hasFrame).toBeTruthy();
  expect(theme.backgroundColor).not.toBe("rgb(255, 255, 255)");

  await expect(page.getByRole("heading", { name: "Tim's Dash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in for sync" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate((state) => {
    window.localStorage.setItem("lattice-wealth-state", JSON.stringify(state));
  }, SEEDED_STATE);
  await page.getByRole("button", { name: "Load Sample Data" }).click();
  await page.getByRole("button", { name: "Holdings" }).click();
  await expect(page.getByText("UBank Everyday")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByText("Insights")).toBeVisible();
  await expect(page.locator(".insights-summary")).toContainText("Since your last check");

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".status-row").filter({ hasText: "Refresh result" })).toContainText("updated");
  await expect(page.locator(".refresh-lines")).toContainText("ETFs");
  await expect(page.locator(".refresh-lines")).toContainText("Crypto");
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();

  const liquidProjectionFirst = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  await page.getByRole("button", { name: "Bank Cash View" }).click();
  const bankProjectionFirst = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  expect(bankProjectionFirst).not.toBe(liquidProjectionFirst);
  await expect(page.getByText("Bank Cash View starts with bank cash only", { exact: false })).toBeVisible();

  await expect(page.locator(".metric-card").filter({ hasText: "Current bank balance" }).locator("strong")).toHaveText("$18,250.00");

  await page.getByRole("button", { name: "Holdings" }).click();
  await expect(page.getByRole("heading", { name: "Holdings" }).first()).toBeVisible();
  await expect(page.getByText("ETHI • ASX")).toBeVisible();
  await expect(page.getByText("Bitcoin")).toBeVisible();
  await expect(page.getByText("Ethereum")).toBeVisible();

  await page.getByRole("button", { name: "Add holding" }).click();
  await page.locator(".type-tabs").getByRole("button", { name: "Cash" }).click();
  await page.getByLabel("Name").fill("Travel cash");
  await page.getByLabel("Amount in AUD").fill("1500");
  await page.locator(".modal-panel").getByRole("button", { name: "Add holding" }).click();
  await expect(page.getByText("Travel cash")).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.locator(".metric-card").filter({ hasText: "Current bank balance" }).locator("strong")).toHaveText("$19,750.00");
  await page.getByRole("button", { name: "Liquid View" }).click();
  const liquidAfterCash = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  await page.getByRole("button", { name: "Bank Cash View" }).click();
  const bankAfterCash = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  expect(bankAfterCash).not.toBe(liquidAfterCash);

  await page.getByRole("button", { name: "Income & Expenses" }).click();
  await expect(page.getByRole("heading", { name: "Income", exact: true })).toBeVisible();
  await expect(page.locator(".entry-row").filter({ hasText: "Salary" })).toBeVisible();
  await expect(page.locator(".entry-row").filter({ hasText: "Rent" })).toBeVisible();

  await page.getByRole("button", { name: "Add income" }).click();
  await page.getByLabel("Name").fill("Consulting");
  await page.getByLabel("Amount in AUD").fill("1000");
  await page.locator(".modal-panel").getByRole("button", { name: "Add income" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "Consulting" })).toBeVisible();

  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Name").fill("Buffer test expense");
  await page.getByLabel("Amount in AUD").fill("22000");
  await page.locator(".modal-panel").getByRole("button", { name: "Add expense" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "Buffer test expense" })).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Bank Cash View" }).click();
  await expect(page.getByText("drops below the safety buffer", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Projections" }).click();
  await expect(page.getByRole("heading", { name: "12-month liquid forecast" })).toBeVisible();
  await expect(page.getByText("projections are based on liquid money only", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Monthly bank balances" })).toBeVisible();
  await expect(page.locator(".history-group").filter({ hasText: "March 2026" })).toBeVisible();

  const change6m = await page.locator(".metric-card").filter({ hasText: "Change over last 6 months" }).locator("strong").textContent();
  await page.getByRole("button", { name: "3m" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over last 3 months" })).toBeVisible();
  const change3m = await page.locator(".metric-card").filter({ hasText: "Change over last 3 months" }).locator("strong").textContent();
  expect(change3m).not.toBe(change6m);
  await page.getByRole("button", { name: "12m" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over last 12 months" })).toBeVisible();
  await page.getByRole("button", { name: "All" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over all available history" })).toBeVisible();

  await page.getByLabel("Import Ubank statement files").setInputFiles("tests/fixtures/ubank-sample.csv");
  await expect(page.getByText("Import Ubank CSV", { exact: true })).toBeVisible();
  await expect(page.locator(".import-review").filter({ hasText: "UBank Everyday" })).toBeVisible();
  await expect(page.locator(".import-review").filter({ hasText: "2026-03-01 to 2026-03-31" })).toBeVisible();
  await expect(page.getByText("Ready to import")).toBeVisible();
  await page.getByRole("button", { name: "Import valid statements" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "Imported from Ubank Everyday" })).toBeVisible();

  await page.getByLabel("Import Ubank statement files").setInputFiles([
    "tests/fixtures/ubank-april-sample.csv",
    "tests/fixtures/ubank-sample.csv",
    "tests/fixtures/ubank-sample.csv",
    "tests/fixtures/ubank-invalid.csv",
  ]);
  await expect(page.getByText("4 files selected", { exact: false })).toBeVisible();
  await expect(page.getByText("ubank-april-sample.csv")).toBeVisible();
  await expect(page.getByText("ubank-invalid.csv")).toBeVisible();
  await page.getByRole("button", { name: "Import valid statements" }).click();
  await expect(page.getByText("1 imported • 2 duplicates skipped • 1 parse error")).toBeVisible();
  await expect(page.locator(".entry-row").filter({ hasText: "April 2026" })).toBeVisible();

  await page.getByRole("button", { name: "Add bank history" }).click();
  await page.getByLabel("Month").fill("2025-10");
  await page.getByLabel("Ending bank balance in AUD").fill("13800");
  await page.getByLabel("Note").fill("Older statement");
  await page.locator(".modal-panel").getByRole("button", { name: "Add history entry" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "October 2025" })).toBeVisible();

  await page.locator(".entry-row").filter({ hasText: "October 2025" }).getByRole("button", { name: /Edit October 2025/ }).click();
  await page.getByLabel("Ending bank balance in AUD").fill("14000");
  await page.getByLabel("Note").fill("Edited older statement");
  await page.locator(".modal-panel").getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "Edited older statement" })).toBeVisible();

  await page.getByRole("button", { name: "Add bank history" }).click();
  await page.getByLabel("Month").fill("2025-09");
  await page.getByLabel("Ending bank balance in AUD").fill("13200");
  await page.locator(".modal-panel").getByRole("button", { name: "Add history entry" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "September 2025" })).toBeVisible();

  await page.locator(".entry-row").filter({ hasText: "October 2025" }).getByRole("button", { name: /Delete October 2025/ }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "October 2025" })).toHaveCount(0);

  await expect(page.locator(".metric-card").filter({ hasText: "Average monthly bank change" }).locator("strong")).not.toHaveText("Add more history");

  await expect(page.getByRole("heading", { name: "Liquid snapshot history" })).toBeVisible();
  await expect(page.locator(".snapshot-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".status-row").filter({ hasText: "Refresh result" })).toContainText("5 updated • 0 failed");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".snapshot-row")).toHaveCount(2);
  await page.locator(".snapshot-row").first().getByRole("button").click();
  await expect(page.locator(".snapshot-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("No refresh history yet.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tim's Dash" })).toBeVisible();
  await page.getByRole("button", { name: "Holdings" }).click();
  await expect(page.getByText("Travel cash")).toBeVisible();
  await page.getByRole("button", { name: "Income & Expenses" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "Consulting" })).toBeVisible();
  await expect(page.locator(".entry-row").filter({ hasText: "Buffer test expense" })).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".entry-row").filter({ hasText: "September 2025" })).toBeVisible();

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("lattice-wealth-state");
    return raw ? JSON.parse(raw) : null;
  });

  expect(state.holdings.some((holding: { name: string }) => holding.name === "Travel cash")).toBeTruthy();
  expect(state.incomes.some((entry: { name: string }) => entry.name === "Consulting")).toBeTruthy();
  expect(state.expenses.some((entry: { name: string }) => entry.name === "Buffer test expense")).toBeTruthy();
  expect(state.bankHistory.some((entry: { month: string }) => entry.month === "2025-09")).toBeTruthy();
  expect(state.snapshots).toHaveLength(0);
});
