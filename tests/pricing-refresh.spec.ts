import { expect, test } from "@playwright/test";

test("official ASX ETF quotes refresh while crypto still refreshes", async ({ page }) => {
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
  await page.getByRole("button", { name: "Load Sample Data" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect(page.locator(".status-row").filter({ hasText: "Refresh result" })).toContainText("5 updated • 0 failed");
  await expect(page.locator(".refresh-lines")).toContainText("ETFs");
  await expect(page.locator(".refresh-lines")).toContainText("Crypto");

  await page.getByRole("button", { name: "Holdings" }).click();
  await expect(page.getByText("Official ASX ETF price", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Official ASX quote last updated", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Live crypto price", { exact: false }).first()).toBeVisible();
});
