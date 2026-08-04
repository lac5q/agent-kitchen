import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    // Overridable because 3002 is commonly already taken by the operator's
    // own long-running dev server on the MAIN checkout. A worktree run that
    // silently hit that server would test the wrong code and pass — the most
    // expensive kind of green. Set E2E_BASE_URL to your worktree's port.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    headless: true,
    // Every operator route requires a session; global-setup mints one.
    storageState: "./e2e/.auth/operator.json",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
