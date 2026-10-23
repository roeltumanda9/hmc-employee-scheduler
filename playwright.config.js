import { defineConfig } from "@playwright/test";

// End-to-end tests: `npm run test:e2e`. They sign in to the live Supabase
// project with the test accounts in `.env.e2e` and only touch the
// "E2E Test" department, which global-setup creates and global-teardown
// removes (see e2e/db.js).
const PORT = 5180;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.js",
  // One shared test department, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.js",
  globalTeardown: "./e2e/global-teardown.js",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The Edge already installed on this PC; no browser download needed.
    channel: "msedge",
    // Desktop layout (the grid fits without sideways scrolling).
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
