import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import { canSearchDeck } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import type { ScryfallTag } from "../content/scryfall";
import { artTagsAtom, deckAtom, oracleTagsAtom, settingsAtom, type Loadable } from "../state";
import { searchLink, TAG_KINDS, tagPillStyle } from "./tagLinks";

// Mimics the card details modal's own sections ("Card Tags", "Card Legality"):
// a bold title, the content, then an `hr`.
const styles = {
  // The header's `mb-2`.
  heading: { margin: "0 0 0.5rem", fontSize: "inherit", fontWeight: 700 },
  list: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.3rem",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  // Moxfield's `.text-nodata` ("No tags for this card."): small, italic and dimmed.
  note: { margin: 0, fontSize: "0.8em", fontStyle: "italic", opacity: 0.5 },
  // Moxfield's `hr.my-4`, which it recolours from Bootstrap's.
  divider: {
    margin: "1.5rem 0",
    border: 0,
    borderTop: "var(--bs-border-width, 1px) solid var(--bs-border-color, #dee2e6)",
    opacity: 0.4,
  },
} satisfies Record<string, CSSProperties>;

interface TagGroupProps {
  kind: keyof typeof TAG_KINDS;
  state: Loadable<Map<string, ScryfallTag[]>>;
  scryfallId: string;
  /** The deck whose add-card search tags link to, or null to link to Scryfall. */
  searchDeckId: string | null;
}

function TagGroup({ kind, state, scryfallId, searchDeckId }: TagGroupProps) {
  const { title, searchPrefix, background } = TAG_KINDS[kind];

  let body;
  if (state.status === "loaded") {
    const tags = state.value.get(scryfallId) ?? [];
    body = tags.length ? (
      <ul style={styles.list}>
        {tags.map((tag) => (
          <li key={tag.slug}>
            <a
              {...searchLink(`${searchPrefix}:${tag.slug}`, searchDeckId)}
              title={
                tag.inherited
                  ? `Inherited: the card has a more specific tag under "${tag.label}"`
                  : undefined
              }
              style={{ ...tagPillStyle, background, opacity: tag.inherited ? 0.6 : 1 }}
            >
              {tag.label}
            </a>
          </li>
        ))}
      </ul>
    ) : (
      <p style={styles.note}>No {title.toLowerCase()} for this card.</p>
    );
  } else if (state.status === "error") {
    body = <p style={styles.note}>Couldn't load {title.toLowerCase()}</p>;
  } else {
    body = <p style={styles.note}>Loading…</p>;
  }

  return (
    <section>
      <h3 style={styles.heading}>{title}</h3>
      {body}
      <hr style={styles.divider} />
    </section>
  );
}

/** Scryfall oracle and art tags for the card shown in Moxfield's card details modal. */
export function CardTags({ deckId, target: moxfieldCardId }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const oracleTags = useAtomValue(oracleTagsAtom);
  const artTags = useAtomValue(artTagsAtom);
  const { tagSearch, showArtTags } = useAtomValue(settingsAtom);

  if (deckState.status !== "loaded" || !moxfieldCardId) return null;
  // Multi-face cards are identified by a face's id rather than the card's.
  const entry = Object.values(deckState.value.boards)
    .flatMap((board) => Object.values(board?.cards ?? {}))
    .find(
      (e) =>
        e.card.id === moxfieldCardId ||
        e.card.card_faces?.some((face) => face.id === moxfieldCardId),
    );
  if (!entry) return null;
  // The add-card search only exists on decks the user can edit; elsewhere, fall back to Scryfall.
  const searchDeckId = tagSearch === "moxfield" && canSearchDeck() ? deckId : null;

  return (
    <>
      <TagGroup
        kind="oracle"
        state={oracleTags}
        scryfallId={entry.card.scryfall_id}
        searchDeckId={searchDeckId}
      />
      {showArtTags && (
        <TagGroup
          kind="art"
          state={artTags}
          scryfallId={entry.card.scryfall_id}
          searchDeckId={searchDeckId}
        />
      )}
    </>
  );
}
