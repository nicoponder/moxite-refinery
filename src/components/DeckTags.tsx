import { useAtomValue } from "jotai";
import { useMemo, useState, type CSSProperties } from "react";
import { canSearchDeck, tagCards, tagKey, type Deck } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import { moxfieldAuthorization, refreshMoxfieldDeck } from "../content/moxfieldPage";
import type { ScryfallTag } from "../content/scryfall";
import { addAuthorTag, deckAtom, oracleTagsAtom, settingsAtom } from "../state";
import { DeleteTagDialog } from "./DeleteTagDialog";
import { RenameTagDialog } from "./RenameTagDialog";
import { searchLink, TAG_KINDS, tagPillStyle } from "./tagLinks";

// The boards a deck is played with; the maybeboard, sideboard and tokens aren't counted.
const BOARDS = ["commanders", "mainboard"];
// Tags on fewer copies than this are left out, as too rare to say much about the
// deck: the natural log of the deck's size (in `BOARDS`), rounded down, at least 1.
// That's 4 for a 100-card Commander deck and 3 for 21 to 54 cards.
function minCopies(deckSize: number): number {
  return Math.max(1, Math.floor(Math.log(deckSize)));
}
// For Scryfall tags the deck's author already has a Moxfield card tag for.
const MATCHED_BACKGROUND = "hsl(140 60% 42% / 0.35)";

// Mimics the other rows of the deck list's "Related cards" section ("Tokens
// (4) - Expand"): an icon, the title and count, a dash, then an "Expand" link
// with a chevron, and the contents below once expanded.
const styles = {
  // The row's `d-flex align-items-center gap-2`.
  row: { display: "flex", alignItems: "center", gap: "0.5rem" },
  // The toggle's `d-inline-flex align-items-center gap-1`, coloured like a link.
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: 0,
    border: 0,
    background: "none",
    color: "var(--bs-primary)",
    font: "inherit",
    cursor: "pointer",
  },
  // The contents' `m-3`.
  body: { margin: "1rem" },
  list: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.3rem",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  count: { marginLeft: "0.35rem", opacity: 0.7 },
  // A pill that's a button rather than a link.
  button: { border: 0, font: "inherit", cursor: "pointer" },
  // Moxfield's `.text-nodata`: small, italic and dimmed.
  note: { margin: 0, fontSize: "0.8em", fontStyle: "italic", opacity: 0.5 },
  status: { margin: "0.5rem 0 0", opacity: 0.7 },
} satisfies Record<string, CSSProperties>;

interface TagCount {
  slug: string;
  label: string;
  /** Copies in the deck with this tag, directly or through a more specific one. */
  copies: number;
  /** Whether any card has the tag itself, rather than only a more specific one under it. */
  direct: boolean;
  /** The cards with it, by `card.name`. */
  names: string[];
  /** The same, as "Island" or "Island ×10", by name. */
  cards: string[];
  /** Whether the deck's author has a Moxfield card tag of the same name. */
  matched: boolean;
}

/**
 * The oracle tags on at least `minCopies()` of the deck's cards: those matching
 * one of the author's Moxfield card tags first, then most copies first.
 */
function countTags(deck: Deck, oracleTags: Map<string, ScryfallTag[]>): TagCount[] {
  const authorTags = new Set(
    Object.values(deck.authorTags ?? {})
      .flat()
      .map(tagKey),
  );
  const counts = new Map<string, TagCount>();
  let deckSize = 0;
  for (const board of BOARDS) {
    for (const { quantity, card } of Object.values(deck.boards[board]?.cards ?? {})) {
      deckSize += quantity;
      for (const tag of oracleTags.get(card.scryfall_id) ?? []) {
        let count = counts.get(tag.slug);
        if (!count) {
          count = {
            slug: tag.slug,
            label: tag.label,
            copies: 0,
            direct: false,
            names: [],
            cards: [],
            matched: authorTags.has(tagKey(tag.label)),
          };
          counts.set(tag.slug, count);
        }
        count.copies += quantity;
        count.direct ||= !tag.inherited;
        count.names.push(card.name);
        count.cards.push(quantity > 1 ? `${card.name} ×${quantity}` : card.name);
      }
    }
  }
  const common = [...counts.values()].filter((count) => count.copies >= minCopies(deckSize));
  for (const count of common) count.cards.sort((a, b) => a.localeCompare(b));
  return common.sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
      b.copies - a.copies ||
      a.label.localeCompare(b.label),
  );
}

/** A tag outline, standing in for the other rows' Font Awesome icons (Lucide's "tag"). */
function TagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // Font Awesome's box for the other rows' icons: 1.25em wide, 1em high.
      style={{ width: "1.25em", height: "1em", flexShrink: 0 }}
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

/** The toggle's chevron, pointing down to expand and up to collapse. */
function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      // Cropped to the chevron, which fills the glyph like Font Awesome's.
      viewBox="4 4 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // The other rows' `fal small fa-chevron-down`: 0.875em, in a 1.25em-wide box.
      style={{ fontSize: "0.875em", width: "1.25em", height: "1em" }}
    >
      <path d={up ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

/** A collapsible list of the Scryfall oracle tags across the deck, below the deck list. */
export function DeckTags({ deckId }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const oracleTags = useAtomValue(oracleTagsAtom);
  const { tagSearch } = useAtomValue(settingsAtom);
  const [expanded, setExpanded] = useState(false);
  // The Moxfield card tag being created from a Scryfall tag, and how it went:
  // the number of cards tagged once done, or the error.
  const [creating, setCreating] = useState<{
    label: string;
    tagged?: number;
    /** Cards it couldn't find in the deck as saved. */
    missing?: string[];
    error?: unknown;
  } | null>(null);
  const { searchPrefix, background } = TAG_KINDS.oracle;

  const tags = useMemo(
    () =>
      deckState.status === "loaded" && oracleTags.status === "loaded"
        ? countTags(deckState.value, oracleTags.value)
        : null,
    [deckState, oracleTags],
  );

  /** Tags the tag's cards with a Moxfield card tag of the same name. */
  async function createTag(tag: TagCount) {
    setCreating({ label: tag.label });
    try {
      const authorization = await moxfieldAuthorization();
      if (!authorization) throw new Error("Couldn't find your Moxfield sign-in");
      const { tagged, missing } = await tagCards(deckId, tag.names, tag.label, authorization);
      addAuthorTag(
        tag.names.filter((name) => !missing.includes(name)),
        tag.label,
      );
      setCreating({ label: tag.label, tagged, missing });
      // Moxfield's page still has the old tags and version, and would save
      // them over these; if it can't be made to refetch the deck, reload it.
      if (!(await refreshMoxfieldDeck(deckId))) location.reload();
    } catch (error) {
      console.error("[moxite-refinery]", error);
      setCreating({ label: tag.label, error });
    }
  }

  let body;
  if (tags) {
    // Only decks the user can edit have the add-card search, and card tags to add.
    const canEdit = canSearchDeck();
    const searchDeckId = tagSearch === "moxfield" && canEdit ? deckId : null;
    const busy = creating !== null && creating.tagged === undefined && creating.error === undefined;
    body = tags.length ? (
      <>
        <ul style={styles.list}>
          {tags.map((tag) => {
            const title =
              (tag.matched ? `Moxfield tag "${tag.label}" exists\n\n` : "") +
              (tag.matched || !canEdit
                ? ""
                : `Click to create the Moxfield tag "${tag.label}" on these cards\n\n`) +
              (tag.direct
                ? ""
                : `Inherited: these cards have more specific tags under "${tag.label}"\n\n`) +
              tag.cards.join("\n");
            const style = {
              ...tagPillStyle,
              background: tag.matched ? MATCHED_BACKGROUND : background,
              opacity: tag.direct ? 1 : 0.6,
            };
            const content = (
              <>
                {tag.label}
                <span style={styles.count}>{tag.copies}</span>
              </>
            );
            return (
              <li key={tag.slug}>
                {tag.matched || !canEdit ? (
                  <a
                    {...searchLink(`${searchPrefix}:${tag.slug}`, searchDeckId)}
                    title={title}
                    style={style}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createTag(tag)}
                    title={title}
                    style={{ ...style, ...styles.button, cursor: busy ? "progress" : "pointer" }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {creating && (
          <p style={styles.status}>
            {creating.error !== undefined
              ? `Couldn't create the Moxfield tag "${creating.label}": ${String(creating.error)}`
              : creating.tagged !== undefined
                ? `Created the Moxfield tag "${creating.label}" on ${creating.tagged} ${creating.tagged === 1 ? "card" : "cards"}` +
                  (creating.missing?.length
                    ? `; couldn't find ${creating.missing.join(", ")} in the deck`
                    : "")
                : `Creating the Moxfield tag "${creating.label}"…`}
          </p>
        )}
      </>
    ) : (
      <p style={styles.note}>None</p>
    );
  } else if (deckState.status === "error" || oracleTags.status === "error") {
    body = <p style={styles.note}>Couldn't load oracle tags</p>;
  } else {
    body = <p style={styles.note}>Loading…</p>;
  }

  return (
    <div>
      <div style={styles.row}>
        <TagIcon />
        Oracle Tags{tags ? ` (${tags.length})` : ""} -
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          style={styles.toggle}
        >
          <span>{expanded ? "Collapse" : "Expand"}</span>
          <Chevron up={expanded} />
        </button>
      </div>
      {expanded && <div style={styles.body}>{body}</div>}
      {/* For the tag group menus' "Rename Moxfield Tag" and "Delete Moxfield Tag", which unmount with the menu. */}
      <RenameTagDialog deckId={deckId} />
      <DeleteTagDialog deckId={deckId} />
    </div>
  );
}
