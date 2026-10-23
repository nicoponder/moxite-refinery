import { CardTags } from "../components/CardTags";
import { DeckTags } from "../components/DeckTags";
import { GroupSummary } from "../components/GroupSummary";
import { GroupTagMenuItem } from "../components/GroupTagMenuItem";
import { Settings } from "../components/Settings";
import { GROUP_HEADER, groupHeaderTitle, openGroupMenuHeader } from "./groupMenu";
import type { Injection } from "./injector";

// Add new components here. Moxfield's class names are partly hashed build
// output (e.g. `footer.e2coB2Hm3Jq3ppyCin9h`), so anchor on ids, tags and
// Bootstrap classes instead.
export const injections: Injection[] = [
  {
    // Card details modal (a card's ⋯ menu → View Details). Goes in the right
    // column, just above the format legality grid (the column's `.row`).
    // Prev/Next replaces the whole modal, which remounts this.
    id: "card-tags",
    anchor: () =>
      document
        .querySelector(".modal.show h1")
        ?.closest(".col-sm-6")
        ?.querySelector(":scope > .row") ?? null,
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
    // Above each group of cards in the mainboard, in every view (Text,
    // Condensed Text, Visual Grid, Visual Stacks, Visual Stacks (Split), Visual
    // Spoiler). A group's header is the same link in all of them, with a
    // dropdown caret and the group's total quantity ("Lands (35)"); only its
    // container differs (a `li`, a `div.stack-title` or a plain `div`), so this
    // goes before that container. The mainboard is the deck view's first list
    // of groups; later ones are other boards, such as "Considering" (the
    // maybeboard) once expanded. The commander group ("Commander (1)", or
    // "Commanders (2)" with partners) is skipped: commanders start in the
    // command zone, so they're never drawn.
    id: "group-summary",
    anchor: () => {
      const mainboard = [...document.querySelectorAll("section.deckview > div > *")].find((list) =>
        list.querySelector(GROUP_HEADER),
      );
      if (!mainboard) return null;
      return [...mainboard.querySelectorAll(GROUP_HEADER)]
        .filter((header) => !/^Commanders?\s*\(\d+\)/.test(header.textContent?.trim() ?? ""))
        .map((header) => header.parentElement!);
    },
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
    // Below the deck list's collapsible sections ("Tokens", "Considering" for
    // the maybeboard, and "Recent History"), which close the deck list's
    // column. Each is a toggle (a `div.cursor-pointer` with a bold title)
    // between `hr`s, and expands below itself. Decks without tokens or a
    // maybeboard lack those sections, so any of them will do.
    id: "deck-tags",
    anchor: () =>
      [...document.querySelectorAll("section.deckview div.cursor-pointer > strong")]
        .find((title) =>
          /^(?:Tokens \(\d+\)|Considering \(\d+\)|Recent History)$/.test(
            title.textContent?.trim() ?? "",
          ),
        )
        ?.closest("section.deckview > div") ?? null,
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
    // The deck page's fixed bottom bar; goes at the end of its right-hand
    // group of card type counts.
    id: "settings",
    anchor: () => document.getElementById("planeswalkers-count")?.parentElement ?? null,
    position: "beforeend",
    component: Settings,
  },
];
