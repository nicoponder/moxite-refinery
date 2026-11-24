import { defineConfig } from "@playwright/test";

// End-to-end tests: they load `dist/` (built by `npm test`) into Chromium and
// check each injected component against the live Moxfield site, so they need a
// network connection and fail when Moxfield changes its page under them.
export default defineConfig({
  testDir: "tests",
  // Moxfield is slow to load, and the first run downloads Scryfall's ~6 MB oracle tags.
  timeout: 120_000,
  expect: { timeout: 60_000 },
  // One browser at a time, to go easy on Moxfield.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    // Moxfield doesn't load for headless Chromium, so a window opens for each test.
    headless: false,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
