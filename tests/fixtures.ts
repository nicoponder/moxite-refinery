import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";

/** The deck CLAUDE.md describes: a commander, a maybeboard, double-faced cards, deck and card tags. */
export const TEST_DECK_URL = "https://moxfield.com/decks/7geKEhIPjEGtBTVUISFXjw";

const DIST = decodeURIComponent(new URL("../dist", import.meta.url).pathname);

/**
 * Tests run in a fresh Chromium profile with the built extension loaded, so
 * settings start at their defaults. Each test gets the deck page, loaded, and
 * fails if the content script logs an error.
 */
export const test = base.extend<{ context: BrowserContext; deckPage: Page }>({
  // Extensions only load into a persistent context, with Playwright's bundled Chromium.
  context: async ({ headless, viewport }, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless,
      viewport,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
  deckPage: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("[moxite-refinery]")) {
        errors.push(message.text());
      }
    });
    await page.goto(TEST_DECK_URL);
    // Past "Loading Moxfield…": the deck list is there.
    await expect(page.locator("section.deckview")).toBeAttached();
    await use(page);
    expect(errors, "errors logged by the content script").toEqual([]);
  },
});

export { expect };

/** An injected component's hosts. CSS locators pierce their open shadow roots. */
export function host(page: Page, id: string) {
  return page.locator(`[data-moxite-refinery="${id}"]`);
}
