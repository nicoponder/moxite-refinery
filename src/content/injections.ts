import { CardTags } from "../components/CardTags";
import { DeckTags } from "../components/DeckTags";
import { GroupSummary } from "../components/GroupSummary";
import { GroupTagMenuItem } from "../components/GroupTagMenuItem";
import { Settings } from "../components/Settings";
import { GROUP_HEADER, groupHeaderTitle, openGroupMenuHeader } from "./groupMenu";
import type { Injection } from "./injector";

/**
 * The mainboard's group headers, in any view. The mainboard is the deck view's
 * first list of groups; later ones are other boards, such as "Considering"
 * (the maybeboard) once expanded.
 */
function mainboardGroupHeaders(): Element[] {
  const mainboard = [...document.querySelectorAll("section.deckview > div > *")].find((list) =>
    list.querySelector(GROUP_HEADER),
  );
  return mainboard ? [...mainboard.querySelectorAll(GROUP_HEADER)] : [];
}

// Add new components here. Moxfield's class names are partly hashed build
// output (e.g. `div.p1MgompCDAeWEqmrjXoI`), so anchor on its `data-testid`
// attributes, ids, tags and Bootstrap classes instead.
export const injections: Injection[] = [
  {
    // Card details modal (a card's ⋯ menu → its name, at the top of the menu).
    // The modal's right-hand column is a run of sections, each a header (a
    // `div` with a bold title) followed by its content and an `hr`: rules
    // text, "Card Tags" (the author's), "Card Legality", "Rulings". This goes
    // just before the "Card Legality" header. Prev/Next replaces the whole
    // modal, which remounts this.
    id: "card-tags",
    anchor: () => document.querySelector('.modal.show [data-testid="card-modal-legality"]'),
    position: "beforebegin",
    // The card image's URL holds Moxfield's card id, .../cards/card-<card.id>-normal.webp,
    // or for multi-face cards a face id, .../cards/card-face-<card_faces[].id>-normal.webp.
    target: (anchor) =>
      /\/card-(?:face-)?([A-Za-z0-9]+)-normal\./.exec(
        anchor.closest(".modal")?.querySelector("img.deckview-image.front")?.getAttribute("src") ??
          "",
      )?.[1] ?? null,
    component: CardTags,
  },
  {
    // Above each group of cards in the mainboard, in every view (Text, Text
    // Compact, Image Grid, Image Grid Compact, Image Stacks, Image Stacks
    // (Split)). A group's header is the same link in all of them, with a
    // dropdown caret and the group's total quantity ("Lands (35)"); only its
    // container differs (a `li`, a `div.stack-title` or a plain `div`), so this
    // goes before that container. Above the lands group, its row ends with
    // `LandsTools`' button. The commander group ("Commander (1)", or
    // "Commanders (2)" with partners) is skipped: commanders start in the
    // command zone, so they're never drawn.
    id: "group-summary",
    anchor: () =>
      mainboardGroupHeaders()
        .filter((header) => !/^Commanders?\s*\(\d+\)/.test(header.textContent?.trim() ?? ""))
        .map((header) => header.parentElement!),
    position: "beforebegin",
    // The group's name and total quantity, as "Lands (35)". The header's text
    // runs them together ("Lands(35)") in some views.
    target: (anchor) => {
      const header = anchor.querySelector(GROUP_HEADER);
      const title = header && groupHeaderTitle(header);
      return title ? `${title.name} (${title.count})` : null;
    },
    // Matches the "% of all symbols" captions under the color analysis.
    hostClassName: "small text-muted",
    component: GroupSummary,
  },
  {
    // The deck list's "Related cards" section, below the boards: a list of
    // collapsible rows ("Tokens (4) - Expand", "Considering (15) - Expand",
    // each expanding below itself), whose toggles have test ids. "Considering"
    // is there even when the maybeboard is empty, so the list always is. This
    // is another row at its end.
    id: "deck-tags",
    anchor: () =>
      document
        .querySelector('section.deckview [data-testid^="deck-list-related-cards-"]')
        ?.closest(".flex-column") ?? null,
    position: "beforeend",
    component: DeckTags,
  },
  {
    // The end of a card group's menu (its header's dropdown: "Copy Section to
    // Clipboard", "Buy All"), which Moxfield portals to the end of `body`.
    // Other dropdowns share its classes, so it's told apart by its first item.
    // Which group it's for comes from the header last clicked (`groupMenu.ts`).
    id: "group-menu",
    anchor: () =>
      [...document.querySelectorAll("body > .dropdown-menu.show > .dropdown-menu-parent")].find(
        (menu) =>
          openGroupMenuHeader() !== null &&
          menu.querySelector(".dropdown-item")?.textContent?.trim() === "Copy Section to Clipboard",
      ) ?? null,
    position: "beforeend",
    target: () => {
      const header = openGroupMenuHeader();
      return (header && groupHeaderTitle(header)?.name) ?? null;
    },
    component: GroupTagMenuItem,
  },
  {
    // The deck page's fixed bottom bar, at the end of its row. On wide screens
    // the bar shows all its views (counts, legality, price, card types); on
    // narrow ones it shows one at a time, with arrows at the end of the row
    // to switch, so this goes after those rather than in a view.
    id: "settings",
    anchor: () => document.querySelector('[data-testid="deck-floating-bar-root"] > .container'),
    position: "beforeend",
    component: Settings,
  },
];
