import { expect, test } from "@playwright/test";

test("redesigned shell renders key navigation and dashboard surfaces", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Tim's Dash")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dashboard/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Holdings/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Usable Total")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Tim|Welcome back, Tim/i })).toBeVisible();
  await expect(page.getByText("Insights")).toBeVisible();
  await expect(page.locator(".side-nav")).toBeVisible();
  await expect(page.locator(".workspace-topbar")).toBeVisible();
});
