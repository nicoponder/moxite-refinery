import type { AnchorHTMLAttributes, CSSProperties, MouseEvent } from "react";
import { deckSearchPath, navigateInApp } from "../content/deck";

// Translucent fills over inherited text colour, so pills read on both of
// Moxfield's light and dark themes.
export const TAG_KINDS = {
  oracle: { title: "Oracle Tags", searchPrefix: "otag", background: "hsl(210 85% 55% / 0.28)" },
  art: { title: "Art Tags", searchPrefix: "atag", background: "hsl(330 75% 58% / 0.28)" },
} as const;

/** A tag's pill; add its kind's `background`. */
export const tagPillStyle = {
  display: "inline-block",
  padding: "0.15rem 0.55rem",
  borderRadius: "999px",
  fontSize: "0.8rem",
  lineHeight: 1.5,
  color: "inherit",
  textDecoration: "none",
} satisfies CSSProperties;

/** Follows a plain left click within the app; modified clicks (new tab etc.) keep the browser's behaviour. */
function followInApp(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigateInApp(event.currentTarget.getAttribute("href")!);
}

/** Link attributes for a search: the deck's add-card search when `deckId` is given, else Scryfall's in a new tab. */
export function searchLink(
  query: string,
  deckId: string | null,
): AnchorHTMLAttributes<HTMLAnchorElement> {
  return deckId
    ? { href: deckSearchPath(deckId, query), onClick: followInApp }
    : {
        href: `https://scryfall.com/search?q=${encodeURIComponent(query)}`,
        target: "_blank",
        rel: "noreferrer",
      };
}
