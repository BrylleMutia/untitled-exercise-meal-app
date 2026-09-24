import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const defaultAuthState = path.resolve("playwright/.auth/user-a.json");
const authState = process.env.PLAYWRIGHT_AUTH_STATE
  ? path.resolve(process.env.PLAYWRIGHT_AUTH_STATE)
  : defaultAuthState;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // The release suite intentionally uses two retained accounts and includes
  // durable retry/cleanup scenarios. Keep projects serialized so desktop and
  // mobile cannot race on the same remote test account revision.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    storageState: fs.existsSync(authState) ? authState : undefined,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3000",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop",
      testMatch: /mvp1-release\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      testMatch: /mvp1-release\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
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
