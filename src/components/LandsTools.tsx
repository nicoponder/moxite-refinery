import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { addCards, canSearchDeck, type Deck } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import { moxfieldAuthorization, refreshMoxfieldDeck } from "../content/moxfieldPage";
import { searchCards, type SearchCard } from "../content/scryfall";
import { deckAtom, reloadDeck, type Loadable } from "../state";
import { Dialog } from "./Dialog";
import { Tooltip } from "./Tooltip";

/** A section of the modal: the cards a Scryfall search finds, by default for an oracle tag. */
interface LandSection {
  /** The tag's slug, searched with `otag:` unless `search` says otherwise. Also the section's key. */
  tag: string;
  /** The section's title; by default the tag's, in title case ("cycle-bondland" → "Bondland"). */
  title?: string;
  /** The Scryfall search for its cards, instead of `otag:<tag>`. */
  search?: string;
  /** Whether its header has an "Add all" button (by default it does). */
  addAll?: boolean;
  /**
   * Another button in its header, adding only those of its cards that the
   * search `search(identity)` also finds (`identity` as `identityQuery()`
   * gives it), or none if that's null.
   */
  addSome?: { label: string; doneLabel: string; search: (identity: string) => string | null };
}

// The basic land type of each colour, as named in a card's rules text.
const BASIC_LAND_TYPES: Record<string, string> = {
  w: "plains",
  u: "island",
  b: "swamp",
  r: "mountain",
  g: "forest",
};

// Scryfall oracle tags for kinds of lands: a few popular ones first, then the
// tags matching /cycle.*land/ that are the parents of those on the cards of the
// "dual lands" package deck (moxfield.com/decks/uLzPvfBv6kOnttQ0svTAuw) as of
// 2026-11-24, which none of its cards has itself, but for the broadest two
// (`cycle-land`, `cycle-dual-land`).
const LAND_SECTIONS: LandSection[] = [
  { tag: "shockland", title: "Shock Land", search: "is:shockland" },
  {
    tag: "fetchland",
    title: "Fetch Land",
    search: "is:fetchland",
    // The fetchlands that can fetch a land type of the deck's colours.
    addSome: {
      label: "Add all in-color",
      doneLabel: "All in-color added",
      search: (identity) => {
        const types = identity
          .split("")
          .flatMap((color) => (BASIC_LAND_TYPES[color] ? [`o:${BASIC_LAND_TYPES[color]}`] : []));
        return types.length ? `is:fetchland (${types.join(" OR ")})` : null;
      },
    },
  },
  { tag: "triome" },
  { tag: "painland", title: "Pain Land" },
  // Nearly every deck could play these, so there's no adding them all at once.
  { tag: "rainbow-land", addAll: false },
  { tag: "cycle-abu-dual-land", title: "True Dual Lands" },
  { tag: "cycle-block-ths-scry-land", title: "Scry Land" },
  { tag: "cycle-dual-surveil-land", title: "Surveil Land" },
  { tag: "cycle-bondland" },
  { tag: "cycle-checkland" },
  { tag: "cycle-cycling-land" },
  { tag: "cycle-dual-creatureland" },
  { tag: "cycle-dual-tapland" },
  { tag: "cycle-fastland" },
  { tag: "cycle-fra-walkerland" },
  { tag: "cycle-hybrid-filterland" },
  { tag: "cycle-lrw-typal-land" },
  { tag: "cycle-napland" },
  { tag: "cycle-ody-filterland" },
  { tag: "cycle-painland" },
  { tag: "cycle-restless-land" },
  { tag: "cycle-reveal-land" },
  { tag: "cycle-slowland" },
  { tag: "cycle-zendikar-creatureland" },
];

/**
 * A section's title: its own, or its tag's slug with spaces for hyphens, in
 * title case; either way without a leading "Cycle" ("cycle-bondland" → "Bondland").
 */
function sectionTitle({ tag, title }: LandSection): string {
  const full =
    title ??
    tag
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  return full.replace(/^Cycle\s+/i, "");
}

// The modal is as wide as five cards in a row, whatever its sections hold, or
// the viewport if that's narrower (less the dialog's margin and padding).
const CARDS_PER_ROW = 5;
const CARD_WIDTH = "200px";
const CARD_GAP = "0.5rem";
const CONTENT_WIDTH = `min(calc(${CARDS_PER_ROW} * ${CARD_WIDTH} + ${CARDS_PER_ROW - 1} * ${CARD_GAP}), calc(100vw - 5rem))`;

// The add buttons copy Moxfield's own on cards in its add-card search (`btn
// btn-sm btn-outline-primary` with Font Awesome's "plus"), which its styles
// can't reach here: their size, colours and hover as measured, with the theme's
// primary colour for the icon as Moxfield's has. They sit where Moxfield's
// controls do on a card, 40px down and 22px in on a 240 × 335 one.
const stylesheet = `
.add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  box-sizing: border-box;
  height: 26px;
  padding: 0.25rem 0.5rem;
  border: 1px solid #731fa1;
  border-radius: 0.25rem;
  background: rgb(0 0 0 / 0.15);
  color: var(--bs-primary, #731fa1);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}
.add:hover:not(:disabled) { color: #fff; background: #731fa1; }
.add:focus-visible { outline: 0; box-shadow: 0 0 0 0.25rem rgb(115 31 161 / 0.5); }
.add:disabled { opacity: 0.65; cursor: default; }
.add svg { width: 1.25em; height: 1em; overflow: visible; }
.cards {
  display: grid;
  grid-template-columns: repeat(${CARDS_PER_ROW}, minmax(0, 1fr));
  gap: ${CARD_GAP};
  margin: 0;
  padding: 0;
  list-style: none;
}
.card { position: relative; aspect-ratio: 488 / 680; }
.card img, .card .name {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 4.75% / 3.5%;
}
.card .name {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border: 1px solid var(--bs-border-color, #dee2e6);
  text-align: center;
}
.card .add { position: absolute; top: 11.94%; right: 9.15%; }
`;

const styles = {
  root: { display: "contents" },
  open: {
    padding: 0,
    border: 0,
    background: "none",
    // Moxfield's link colour, like the info button beside it.
    color: "var(--bs-primary, #731fa1)",
    cursor: "pointer",
    lineHeight: 0,
  },
  content: { display: "flex", flexDirection: "column", gap: "1.25rem", width: CONTENT_WIDTH },
  section: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  header: { display: "flex", alignItems: "center", gap: "0.75rem" },
  title: { margin: 0, fontSize: "1rem", fontWeight: 600 },
  // The section's title is its toggle.
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: 0,
    border: 0,
    background: "none",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  },
  count: { fontWeight: 400, opacity: 0.7 },
  note: { margin: 0, fontSize: "0.875rem", opacity: 0.7 },
} satisfies Record<string, CSSProperties>;

/** A box with a plus (Lucide's "package-plus"), like Moxfield's own outline icons. */
function PackagePlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22V12" />
      <path d="M16 17h6" />
      <path d="M19 14v6" />
      <path d="M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955" />
      <path d="M3.29 7 12 12l8.71-5" />
      <path d="m7.5 4.27 8.997 5.148" />
    </svg>
  );
}

/** Font Awesome's solid "plus", as on Moxfield's add buttons. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 448 512" aria-hidden="true">
      <path
        fill="currentColor"
        d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"
      />
    </svg>
  );
}

/** A section toggle's chevron, pointing right while collapsed and down while expanded. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="4 4 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ width: "0.875em", height: "0.875em", flexShrink: 0 }}
    >
      <path d={expanded ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

/**
 * The deck's colour identity for Scryfall's `id:` (which finds cards within
 * it), as "wubrg", or "c" when colourless. Moxfield includes it in the deck;
 * failing that, it's the union of its cards'.
 */
function identityQuery(deck: Deck): string {
  const colors =
    deck.colorIdentity ??
    Object.values(deck.boards).flatMap((board) =>
      Object.values(board?.cards ?? {}).flatMap((entry) => entry.card.color_identity ?? []),
    );
  const query = "wubrg"
    .split("")
    .filter((color) => colors.some((c) => c.toLowerCase() === color))
    .join("");
  return query || "c";
}

/** A Scryfall search for `search`'s cards within the colour identity `identity` (`identityQuery()`). */
function withinIdentity(search: string, identity: string): string {
  return `${search} id:${identity}`;
}

/** The searches for a section's cards and for those its `addSome` button adds (or null if none). */
function sectionQueries(
  section: LandSection,
  identity: string,
): { cards: string; some: string | null } {
  const some = section.addSome?.search(identity) ?? null;
  return {
    cards: withinIdentity(section.search ?? `otag:${section.tag}`, identity),
    some: some === null ? null : withinIdentity(some, identity),
  };
}

interface AddMissingButtonProps {
  /** The cards it's for, or null while they're being searched for. */
  cards: SearchCard[] | null;
  inDeck: ReadonlySet<string>;
  label: string;
  /** Shown instead of `label` once every one of `cards` is in the deck. */
  doneLabel: string;
  /** Whether another add is in progress. */
  saving: boolean;
  onAdd: (missing: SearchCard[]) => void;
}

/**
 * Adds those of `cards` that aren't in the deck yet (by name), or says they
 * all are; disabled until the search for them is done.
 */
function AddMissingButton({
  cards,
  inDeck,
  label,
  doneLabel,
  saving,
  onAdd,
}: AddMissingButtonProps) {
  const missing = cards?.filter((card) => !inDeck.has(card.name)) ?? [];
  const done = cards !== null && cards.length > 0 && missing.length === 0;
  return (
    <button
      type="button"
      className="add"
      disabled={saving || !missing.length}
      title={
        !cards
          ? "Waiting for the search"
          : !cards.length
            ? "There are none to add"
            : done
              ? "They're all in the deck"
              : `Add the ${missing.length === 1 ? "card" : `${missing.length} cards`} that aren't in the deck`
      }
      onClick={() => onAdd(missing)}
    >
      {done ? (
        doneLabel
      ) : (
        <>
          <PlusIcon />
          {label}
        </>
      )}
    </button>
  );
}

/**
 * Whether a group summary's `target` ("Lands (35)") is the mainboard's lands
 * group: "Lands" grouped by type, "Untagged Lands" (those without a card tag)
 * grouped by tag.
 */
export function isLandsGroup(group: string): boolean {
  return /^(Untagged )?Lands? \(\d+\)$/.test(group);
}

/**
 * A button that opens a modal with a collapsible section per kind of land, by Scryfall oracle tag (collapsed at
 * first): the cards with it within the deck's colour identity, by Scryfall
 * search. On decks the user can edit, each card has a button that adds a copy
 * to the mainboard, and each section one that adds those of its cards not in
 * the deck yet, or says they all are. `GroupSummary` renders it at the end of
 * the lands group's summary row, so it gets that group as `target`.
 */
export function LandsTools({ deckId }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const dialog = useRef<HTMLDialogElement>(null);
  // The searches run once the modal is first opened.
  const [opened, setOpened] = useState(false);
  // Each search's result, by query, so a deck of other colours starts afresh.
  const [results, setResults] = useState<Record<string, Loadable<SearchCard[]>>>({});
  // While a card (or a section's cards) is being added, every add button waits.
  const [saving, setSaving] = useState(false);
  // The sections expanded, by tag. They start collapsed, and their cards (and
  // so their images) are only rendered once expanded.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (tag: string) =>
    setExpanded((expanded) => {
      const next = new Set(expanded);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  // How the last add in each section went.
  const [messages, setMessages] = useState<Record<string, string>>({});
  const identity = deckState.status === "loaded" ? identityQuery(deckState.value) : null;
  // The names of the cards the deck is played with, to tell which are in it already.
  const inDeck = useMemo(
    () =>
      new Set(
        deckState.status === "loaded"
          ? ["commanders", "mainboard"].flatMap((board) =>
              Object.values(deckState.value.boards[board]?.cards ?? {}).map(
                (entry) => entry.card.name,
              ),
            )
          : [],
      ),
    [deckState],
  );

  useEffect(() => {
    if (!opened || identity === null) return;
    let current = true;
    const queries = LAND_SECTIONS.flatMap((section) => {
      const { cards, some } = sectionQueries(section, identity);
      return some === null ? [cards] : [cards, some];
    });
    for (const query of queries) {
      const set = (result: Loadable<SearchCard[]>) =>
        current && setResults((results) => ({ ...results, [query]: result }));
      searchCards(query).then(
        (cards) => set({ status: "loaded", value: cards }),
        (error: unknown) => {
          console.error("[moxite-refinery]", error);
          set({ status: "error", error });
        },
      );
    }
    return () => {
      current = false;
    };
  }, [opened, identity]);

  /** Adds a copy of each of `cards` to the mainboard, reporting under `tag`'s section. */
  async function add(tag: string, cards: SearchCard[]) {
    const what = cards.length === 1 ? cards[0].name : `${cards.length} cards`;
    const report = (message: string) =>
      setMessages((messages) => ({ ...messages, [tag]: message }));
    setSaving(true);
    report(`Adding ${what}…`);
    try {
      const authorization = await moxfieldAuthorization();
      if (!authorization) throw new Error("Couldn't find your Moxfield sign-in");
      await addCards(
        deckId,
        cards.map(({ name, set, cn }) => ({ name, set, cn })),
        authorization,
      );
      report(`Added ${what}`);
      // Moxfield's page still has the old deck and version, and would save
      // them over this; if it can't be made to refetch the deck, reload it.
      // Our own copy is refetched before the buttons are enabled again, so
      // they show what's been added.
      const [refreshed] = await Promise.all([refreshMoxfieldDeck(deckId), reloadDeck()]);
      if (!refreshed) location.reload();
    } catch (error) {
      console.error("[moxite-refinery]", error);
      report(`Couldn't add ${what}: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const canEdit = canSearchDeck();
  return (
    // Its button is laid out by the summary row it's in.
    <div style={styles.root}>
      <style>{stylesheet}</style>
      <Tooltip text="Lands">
        <button
          type="button"
          aria-label="Lands"
          style={styles.open}
          onClick={() => {
            setOpened(true);
            dialog.current?.showModal();
          }}
        >
          <PackagePlusIcon />
        </button>
      </Tooltip>
      <Dialog ref={dialog} title="Lands" wide>
        <div style={styles.content}>
          {identity === null ? (
            <p style={styles.note}>Loading the deck…</p>
          ) : (
            LAND_SECTIONS.map((section) => {
              const { tag } = section;
              const title = sectionTitle(section);
              const queries = sectionQueries(section, identity);
              const result = results[queries.cards] ?? { status: "loading" };
              const cards = result.status === "loaded" ? result.value : null;
              // The cards the `addSome` button adds: none if it has no search.
              const someResult: Loadable<SearchCard[]> =
                queries.some === null
                  ? { status: "loaded", value: [] }
                  : (results[queries.some] ?? { status: "loading" });
              const someCards = someResult.status === "loaded" ? someResult.value : null;
              const isExpanded = expanded.has(tag);
              return (
                <section key={tag} aria-label={title} style={styles.section}>
                  <div style={styles.header}>
                    <h3 style={styles.title}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        style={styles.toggle}
                        onClick={() => toggle(tag)}
                      >
                        <Chevron expanded={isExpanded} />
                        {title}
                        {cards && <span style={styles.count}>({cards.length})</span>}
                      </button>
                    </h3>
                    {canEdit && section.addAll !== false && (
                      <AddMissingButton
                        cards={cards}
                        inDeck={inDeck}
                        label="Add all"
                        doneLabel="All added"
                        saving={saving}
                        onAdd={(missing) => void add(tag, missing)}
                      />
                    )}
                    {canEdit && section.addSome && (
                      <AddMissingButton
                        cards={someCards}
                        inDeck={inDeck}
                        label={section.addSome.label}
                        doneLabel={section.addSome.doneLabel}
                        saving={saving}
                        onAdd={(missing) => void add(tag, missing)}
                      />
                    )}
                  </div>
                  {messages[tag] && <p style={styles.note}>{messages[tag]}</p>}
                  {!isExpanded ? null : result.status === "error" ? (
                    <p style={styles.note}>Couldn't search Scryfall</p>
                  ) : !cards ? (
                    <p style={styles.note}>Searching…</p>
                  ) : cards.length === 0 ? (
                    <p style={styles.note}>None in this deck's colors</p>
                  ) : (
                    <ul className="cards">
                      {cards.map((card) => (
                        <li key={card.id} className="card" title={card.name}>
                          {card.image ? (
                            <img src={card.image} alt={card.name} loading="lazy" />
                          ) : (
                            <span className="name">{card.name}</span>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className="add"
                              aria-label={`Add ${card.name}`}
                              disabled={saving}
                              onClick={() => void add(tag, [card])}
                            >
                              <PlusIcon />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
      </Dialog>
    </div>
  );
}
