import { CardTags } from "../components/CardTags";
import { GroupSummary } from "../components/GroupSummary";
import { Settings } from "../components/Settings";
import type { Injection } from "./injector";

// A card group's header link in the deck list, in any view.
const GROUP_HEADER = "a.table-deck-row-link:has(.fa-caret-down)";

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
      const match = /^(.*?)\s*\((\d+)\)/.exec(
        anchor.querySelector(GROUP_HEADER)?.textContent?.trim() ?? "",
      );
      return match ? `${match[1]} (${match[2]})` : null;
    },
    // Matches the "% of all symbols" captions under the color analysis.
    hostClassName: "small text-muted",
    component: GroupSummary,
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
