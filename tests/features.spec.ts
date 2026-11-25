import { GROUP_HEADER } from "../src/content/groupMenu";
import { expect, host, test } from "./fixtures";

// Each test checks that a component is mounted where its injection puts it,
// relative to Moxfield's own elements, and that it shows something sensible.
// They run against the live site, so when one fails, Moxfield has most likely
// changed the part of the page its anchor relies on.

test("group summaries sit above each mainboard group but the commander's", async ({
  deckPage: page,
}) => {
  const summaries = host(page, "group-summary");
  // Each figure is followed by an icon, with what it means in a tooltip on hover.
  const figures = summaries.first().locator("[aria-describedby]");
  await figures.first().hover();
  await expect(summaries.first().getByRole("tooltip").first()).toBeVisible();
  await expect(summaries.first().getByRole("tooltip").first()).toHaveText(
    /^\d+\.\d\d expected in opening 7$/,
  );
  expect(await summaries.count()).toBeGreaterThanOrEqual(3);

  // The figures and the info button sit in one row (the info modal repeats the figures).
  const tops = await figures.evaluateAll((spans) =>
    spans
      .filter((span) => !span.closest("dialog"))
      .map((span) => Math.round(span.getBoundingClientRect().top)),
  );
  expect(tops).toHaveLength(3);
  for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(4);

  // Each sits right before its group's header container.
  const headers = await summaries.evaluateAll(
    (hosts, selector) =>
      hosts.map((h) => h.nextElementSibling?.querySelector(selector)?.textContent?.trim() ?? null),
    GROUP_HEADER,
  );
  for (const header of headers) {
    expect(header).toMatch(/^.+\(\d+\)/);
    expect(header).not.toMatch(/^Commanders?\s*\(/);
  }

  // The info button opens the draw odds dialog.
  await summaries
    .first()
    .getByRole("button", { name: /^Draw odds for / })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("table").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the lands button ends the lands group's summary row and opens a modal", async ({
  deckPage: page,
}) => {
  // Only in the summary above the "Lands (n)" header ("Untagged Lands (n)" on
  // the test deck, which is grouped by tag).
  const summaries = host(page, "group-summary");
  const lands = summaries.filter({ has: page.getByRole("button", { name: "Lands", exact: true }) });
  await expect(lands).toHaveCount(1);
  expect(
    await lands.evaluate(
      (h, selector) => h.nextElementSibling?.querySelector(selector)?.textContent?.trim(),
      GROUP_HEADER,
    ),
  ).toMatch(/^(Untagged )?Lands?\s*\(\d+\)/);
  // In the same row as the info button.
  const [info, open] = await Promise.all(
    [/^Draw odds for /, "Lands"].map((name) =>
      lands.getByRole("button", { name, exact: true }).first().boundingBox(),
    ),
  );
  expect(Math.abs(info!.y + info!.height / 2 - (open!.y + open!.height / 2))).toBeLessThanOrEqual(
    2,
  );

  await lands.getByRole("button", { name: "Lands", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Commonly-Used Lands" });
  await expect(dialog).toBeVisible();
  // A section per kind of land, each with the cards Scryfall finds for its tags.
  const rainbowLands = dialog.getByRole("region", { name: "Rainbow Land" });
  await expect(rainbowLands.getByRole("heading")).toHaveText(/^Rainbow Land\s*\(\d+\)$/, {
    timeout: 15_000,
  });
  // Collapsed at first, so none of its cards (or their images) are there yet.
  await expect(rainbowLands.locator("li")).toHaveCount(0);
  const toggle = rainbowLands.getByRole("button", { name: /^Rainbow Land/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rainbowLands.locator("li img").first()).toBeVisible();
  // Moxfield's own images, as on the deck page.
  await expect(rainbowLands.locator("li img").first()).toHaveAttribute(
    "src",
    /^https:\/\/assets\.moxfield\.net\/cards\/card-[A-Za-z0-9]+-normal\.webp/,
  );
  // Five cards to a row.
  const tops = await rainbowLands
    .locator("li")
    .evaluateAll((cards) => cards.slice(0, 6).map((card) => card.getBoundingClientRect().top));
  expect(new Set(tops.slice(0, 5)).size).toBe(1);
  expect(tops[5]).toBeGreaterThan(tops[0]);
  // Not signed in, so the deck isn't editable and there's nothing to add with.
  await expect(dialog.getByRole("button", { name: /^Add/ })).toHaveCount(0);
  // Toggles at the top, all on at first, hide the sections they match.
  const filters = dialog.getByRole("group", { name: "Kinds of land shown" });
  for (const label of [
    "MDFC",
    "Dual",
    "Mono",
    "Tapped",
    "Conditional Tapped",
    "Utility",
    "Searchable",
  ]) {
    await expect(filters.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  const searchable = filters.getByRole("button", { name: "Searchable", exact: true });
  await searchable.click();
  await expect(searchable).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("region", { name: "Shock Land" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Snow Tapland" })).toHaveCount(0);
  await expect(rainbowLands).toBeVisible();
  await searchable.click();
  await expect(dialog.getByRole("region", { name: "Shock Land" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("oracle tags are a row at the end of the related cards list", async ({ deckPage: page }) => {
  const deckTags = host(page, "deck-tags");
  await expect(deckTags).toHaveCount(1);
  // The same list as Moxfield's own rows ("Tokens", "Considering"), after them.
  expect(
    await deckTags.evaluate(
      (h) =>
        h.parentElement?.lastElementChild === h &&
        h.parentElement.querySelector(
          '[data-testid="deck-list-related-cards-considering-toggle"]',
        ) !== null,
    ),
  ).toBe(true);

  await expect(deckTags).toContainText(/Oracle Tags \(\d+\) -/);
  await deckTags.getByRole("button", { name: "Expand" }).click();
  const pills = deckTags.locator("li");
  await expect(pills.first()).toBeVisible();
  // Not signed in, so the deck isn't editable and the pills are Scryfall search links.
  await expect(pills.first().locator("a")).toHaveAttribute(
    "href",
    /^https:\/\/scryfall\.com\/search\?q=otag%3A/,
  );
  await deckTags.getByRole("button", { name: "Collapse" }).click();
  await expect(pills).toHaveCount(0);
});

test("card tags sit above the details modal's legality section", async ({ deckPage: page }) => {
  const options = page.locator('[data-testid="deck-view-stack-card-options"]').first();
  await options.scrollIntoViewIfNeeded();
  await options.dispatchEvent("click");
  await page.locator('[data-testid="card-options-view-details"]').click();

  const modal = page.locator(".modal.show");
  const cardTags = modal.locator('[data-moxite-refinery="card-tags"]');
  // The heading only renders once the modal's card is found in the deck.
  await expect(cardTags.locator("h3")).toHaveText("Oracle Tags");
  await expect(cardTags).not.toContainText("Loading");
  await expect(cardTags.locator("li, p").first()).toBeVisible();
  expect(await cardTags.evaluate((h) => h.nextElementSibling?.getAttribute("data-testid"))).toBe(
    "card-modal-legality",
  );

  // Next replaces the modal with the next card's, which remounts this for it.
  const title = modal.locator('[data-testid="card-modal-title"]');
  const firstCard = await title.textContent();
  await modal.locator('[data-testid="card-modal-next-card"]').click();
  await expect(title).not.toHaveText(firstCard ?? "");
  await expect(modal.locator('[data-moxite-refinery="card-tags"] h3')).toHaveText("Oracle Tags");
});

test("the group menu gets a component for the group whose header was clicked", async ({
  deckPage: page,
}) => {
  const header = page
    .locator(GROUP_HEADER)
    .filter({ hasNotText: /^Commanders?\s*\(/ })
    .first();
  await header.scrollIntoViewIfNeeded();
  await header.click();
  const menu = page.locator("body > .dropdown-menu.show");
  await expect(menu).toContainText("Copy Section to Clipboard");
  // On decks the user can't edit, "Rename/Delete Moxfield Tag" render nothing, but they're mounted.
  await expect(menu.locator('[data-moxite-refinery="group-menu"]')).toHaveCount(1);
  await header.click();
  await expect(menu).toHaveCount(0);
});

test("a tag group's menu can rename or delete the tag on decks the user can edit", async ({
  deckPage: page,
}) => {
  // The test deck isn't the test profile's, so pretend it is: the extension
  // takes the add-card search bar, shown only on the user's own decks, to mean
  // the deck can be edited. Nothing is saved, as no edit is submitted.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.dataset.testid = "search-bar-input";
    input.hidden = true;
    document.body.append(input);
  });
  // A group that's one of the deck's card tags (it's grouped by type and tag).
  const header = page
    .locator(GROUP_HEADER)
    .filter({ hasNotText: /^(Commanders?|Untagged .*|Creatures?|Lands?)\s*\(/ })
    .first();
  const tag = /^(.*?)\s*\(\d+\)/.exec((await header.textContent())!.trim())![1];
  await header.scrollIntoViewIfNeeded();
  await header.click();
  const menu = page.locator("body > .dropdown-menu.show");
  // After Moxfield's own items.
  await expect(menu.getByRole("button")).toHaveText([
    "Copy Section to Clipboard",
    "Buy All",
    "Rename Moxfield Tag",
    "Delete Moxfield Tag",
  ]);

  await menu.getByRole("button", { name: "Rename Moxfield Tag" }).click();
  await expect(menu).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Rename Moxfield tag" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("textbox");
  await expect(input).toHaveValue(tag);
  await expect(input).toBeFocused();
  const rename = dialog.getByRole("button", { name: "Rename" });
  await expect(rename).toBeDisabled();
  await input.fill("a #b");
  await expect(dialog).toContainText("Tag names can't contain #");
  await expect(rename).toBeDisabled();
  await input.fill(`${tag} renamed`);
  await expect(rename).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("the settings gear ends the bottom bar and opens the settings", async ({ deckPage: page }) => {
  const bar = page.locator('[data-testid="deck-floating-bar-root"]');
  const gear = bar.getByRole("button", { name: "Moxite Refinery settings" });
  await expect(gear).toBeVisible();

  await gear.click();
  const dialog = page.getByRole("dialog", { name: "Moxite Refinery settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Clicking a Scryfall tag opens");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // On narrow screens the bar shows one of its views at a time; the gear stays.
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(gear).toBeVisible();
});
