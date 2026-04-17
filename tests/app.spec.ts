import { expect, test } from "@playwright/test";

test("dashboard, pricing, bank views, history tools, and persistence all work", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");

  const theme = await page.evaluate(() => {
    const body = window.getComputedStyle(document.body);
    return {
      backgroundImage: body.backgroundImage,
      color: body.color,
    };
  });

  expect(theme.backgroundImage).not.toBe("none");
  expect(theme.color).toBe("rgb(245, 247, 251)");

  await expect(page.getByRole("heading", { name: "Tim's Dash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in for sync" })).toBeVisible();
  await page.getByRole("button", { name: "Load Sample Data" }).click();
  await expect(page.getByText("Sample portfolio loaded.")).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("5 updated • 0 failed")).toBeVisible();
  await expect(page.locator(".refresh-lines")).toContainText("ETFs");
  await expect(page.locator(".refresh-lines")).toContainText("Crypto");

  const liquidProjectionFirst = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  await page.getByRole("button", { name: "Bank Cash View" }).click();
  const bankProjectionFirst = await page.locator(".projection-list.compact-list .projection-row").first().locator("strong").last().textContent();
  expect(bankProjectionFirst).not.toBe(liquidProjectionFirst);
  await expect(page.getByText("Bank Cash View starts with bank cash only", { exact: false })).toBeVisible();

  await expect(page.locator(".metric-card").filter({ hasText: "Current bank balance" }).locator("strong")).toHaveText("$18,250.00");

  await page.getByRole("button", { name: "Holdings" }).click();
  await expect(page.getByRole("heading", { name: "Holdings" })).toBeVisible();
  await expect(page.getByText("ETHI • ASX")).toBeVisible();
  await expect(page.getByText("Live crypto price", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Delayed market price", { exact: false }).first()).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
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
  await expect(page.getByText("drops below the safety buffer", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Projections" }).click();
  await expect(page.getByRole("heading", { name: "12-month liquid forecast" })).toBeVisible();
  await expect(page.getByText("projections are based on liquid money only", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Monthly bank balances" })).toBeVisible();
  await expect(page.locator(".entry-row").filter({ hasText: "March 2026" })).toBeVisible();

  const change6m = await page.locator(".metric-card").filter({ hasText: "Change over last 6 months" }).locator("strong").textContent();
  await page.getByRole("button", { name: "3m" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over last 3 months" })).toBeVisible();
  const change3m = await page.locator(".metric-card").filter({ hasText: "Change over last 3 months" }).locator("strong").textContent();
  expect(change3m).not.toBe(change6m);
  await page.getByRole("button", { name: "12m" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over last 12 months" })).toBeVisible();
  await page.getByRole("button", { name: "All" }).first().click();
  await expect(page.locator(".metric-card").filter({ hasText: "Change over all available history" })).toBeVisible();

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
