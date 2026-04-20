import { defineConfig } from "@playwright/test";

const testPort = process.env.PLAYWRIGHT_PORT ?? "3100";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  use: {
    baseURL: testBaseUrl,
    headless: true,
    browserName: "chromium",
    launchOptions: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
  webServer: {
    command: `/opt/homebrew/bin/npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: testBaseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
