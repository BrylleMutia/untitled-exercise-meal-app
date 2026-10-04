import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const userAState = path.resolve("playwright/.auth/user-a.json");

export default defineConfig({
  testDir: "./e2e",
  timeout: 150_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Keep deterministic local-account scenarios serialized across viewports.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["./scripts/playwright-no-skips-reporter.mjs"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3000",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "confirmation",
      testMatch: /confirmation\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] }, trace: "off", screenshot: "off", video: "off" },
    },
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      teardown: "auth-teardown",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth-teardown",
      testMatch: /auth\.teardown\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop",
      testMatch: /mvp[13]-release\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: userAState,
      },
    },
    {
      name: "mobile",
      testMatch: /mvp[13]-release\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        storageState: userAState,
      },
    },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
