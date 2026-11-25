import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { addCards, canSearchDeck, searchMoxfieldCards, type Deck } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import { moxfieldAuthorization, refreshMoxfieldDeck } from "../content/moxfieldPage";
import { fetchTags, searchCards } from "../content/scryfall";
import { deckAtom, reloadDeck, type Loadable } from "../state";
import { Dialog } from "./Dialog";
import { Tooltip } from "./Tooltip";

/** A card in the modal: Moxfield's printing of it, failing that Scryfall's. */
interface LandCard {
  /** Its printing's id, Moxfield's or Scryfall's. */
  id: string;
  /** "Front // Back" for multi-face cards. */
  name: string;
  set: string;
  /** Collector number. */
  cn: string;
  image: string | null;
  /** Its colour identity, as upper-case letters ("W", "U", …). */
  colorIdentity: string[];
  /** Its rules text, its faces' joined by newlines for multi-face cards. */
  oracleText: string;
}

/**
 * A section of the modal: the cards with an oracle tag (or a descendant of it,
 * as Scryfall's `otag:` finds them), by default the one it's keyed by.
 */
interface LandSection {
  /** Its key, and the oracle tag of its cards unless `tags` says otherwise. */
  tag: string;
  /** The section's title; by default the tag's, in title case ("cycle-bondland" → "Bondland"). */
  title?: string;
  /** The oracle tags its cards have one of, instead of `tag`. */
  tags?: string[];
  /** Whether it has only modal double-faced cards, as Scryfall's `is:mdfc` finds. */
  mdfc?: boolean;
  /** The toggles at the top of the modal that show or hide it. */
  filters?: LandFilter[];
  /** Whether its header has an "Add all" button (by default it does). */
  addAll?: boolean;
  /** The fewest colours a deck can have for the section to be in its modal (by default any). */
  minColors?: number;
  /**
   * Another button in its header, adding only those of its cards that
   * `filter` accepts for the deck's colour identity (as `identityQuery()` gives it).
   */
  addSome?: {
    label: string;
    doneLabel: string;
    filter: (card: LandCard, identity: string) => boolean;
  };
}

// The basic land type of each colour, as named in a card's rules text.
const BASIC_LAND_TYPES: Record<string, string> = {
  w: "plains",
  u: "island",
  b: "swamp",
  r: "mountain",
  g: "forest",
};

/**
 * The toggles at the top of the modal, each showing or hiding the sections
 * that list it in their `filters` (all shown at first). "Conditional Tapped"
 * lands can enter tapped or untapped; "Searchable" ones have basic land types,
 * so fetchlands and other searches for a land type find them; "Utility" ones
 * do something besides make mana (fetch, channel or cycle).
 */
const LAND_FILTERS = [
  "MDFC",
  "Dual",
  "Mono",
  "Tapped",
  "Conditional Tapped",
  "Utility",
  "Searchable",
] as const;
type LandFilter = (typeof LAND_FILTERS)[number];

// Kinds of lands by Scryfall oracle tag: a few popular ones first, then the
// tags matching /cycle.*land/ that are the parents of those on the cards of the
// "dual lands" package deck (moxfield.com/decks/uLzPvfBv6kOnttQ0svTAuw) as of
// 2026-11-24, which none of its cards has itself, but for the broadest two
// (`cycle-land`, `cycle-dual-land`). Where Scryfall has an `is:` for a kind
// (`is:shockland`, `is:fetchland`, `is:bounceland`), its tags find the same cards.
const LAND_SECTIONS: LandSection[] = [
  {
    tag: "shockland",
    title: "Shock Land",
    tags: ["cycle-rav-shockland"],
    filters: ["Conditional Tapped", "Searchable"],
  },
  {
    tag: "fetchland",
    title: "Fetch Land",
    tags: ["cycle-ons-fetchland", "cycle-zen-fetchland"],
    filters: ["Utility"],
    // The fetchlands that can fetch a land type of the deck's colours.
    addSome: {
      label: "Add all in-color",
      doneLabel: "All in-color added",
      filter: (card, identity) =>
        identity.split("").some((color) => {
          const type = BASIC_LAND_TYPES[color];
          return type !== undefined && card.oracleText.toLowerCase().includes(type);
        }),
    },
  },
  { tag: "triome", filters: ["Searchable"], minColors: 3 },
  { tag: "cycle-painland", filters: ["Dual"] },
  // Nearly every deck could play these, so there's no adding them all at once.
  { tag: "rainbow-land", addAll: false },
  { tag: "cycle-abu-dual-land", title: "True Dual Lands", filters: ["Dual", "Searchable"] },
  { tag: "cycle-block-ths-scry-land", title: "Scry Land", filters: ["Dual", "Tapped"] },
  { tag: "cycle-dual-surveil-land", title: "Surveil Land", filters: ["Tapped", "Searchable"] },
  { tag: "cycle-horizon-land", title: "Horizon Land", filters: ["Dual"] },
  { tag: "bounceland", title: "Bounce Land", filters: ["Tapped"] },
  { tag: "cycle-neo-legendary-land", title: "Channel Land", filters: ["Utility"] },
  { tag: "cycle-pathway", title: "MDFC Pathway Land", filters: ["MDFC"] },
  {
    tag: "mdfc-boltland",
    title: "MDFC Bolt Land",
    tags: ["boltland"],
    mdfc: true,
    filters: ["MDFC"],
  },
  {
    tag: "cycle-mh3-mdfc-dual-land",
    title: "MDFC Dual Tapland",
    filters: ["MDFC", "Dual", "Tapped"],
  },
  {
    tag: "mdfc-mono-land",
    title: "MDFC Mono Tapland",
    tags: ["cycle-mono-land"],
    mdfc: true,
    filters: ["MDFC", "Mono", "Tapped"],
  },
  { tag: "cycle-khm-snow-tapland", title: "Snow Tapland", filters: ["Tapped", "Searchable"] },
  { tag: "cycle-bondland", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-checkland", filters: ["Dual", "Conditional Tapped"] },
  // Both of Scryfall's cycles of dual cycling lands (Amonkhet's, a child tag, and the enemy-colour one).
  {
    tag: "cycle-dual-cycling-land",
    title: "Dual Cycling Land",
    filters: ["Dual", "Tapped", "Utility"],
  },
  {
    tag: "cycle-ons-m-cycling-land",
    title: "Mono Cycling Land",
    filters: ["Mono", "Tapped", "Utility"],
  },
  { tag: "cycle-dual-creatureland", title: "Creature Land", filters: ["Dual", "Tapped"] },
  { tag: "cycle-dual-tapland", filters: ["Dual", "Tapped"] },
  { tag: "cycle-fastland", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-fra-walkerland", title: "Walkerland", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-hybrid-filterland", filters: ["Dual"] },
  { tag: "cycle-lrw-typal-land", title: "Typal Land", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-napland", filters: ["Dual"] },
  { tag: "cycle-ody-filterland", filters: ["Dual"] },
  { tag: "cycle-restless-land", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-reveal-land", filters: ["Dual", "Conditional Tapped"] },
  { tag: "cycle-slowland", filters: ["Dual", "Conditional Tapped"] },
];

const sectionTags = (section: LandSection): string[] => section.tags ?? [section.tag];

// One search finds every section's cards, of all colours, so that it's the
// same search (and cached once) for every deck; `loadLands()` sorts them into
// sections. It has only `otag:` terms: with an `is:` (`is:mdfc`), Scryfall
// would also find the extras it leaves out by default (funny cards, tokens and
// digital ones).
const LANDS_QUERY = [...new Set(LAND_SECTIONS.flatMap(sectionTags))]
  .map((tag) => `otag:${tag}`)
  .join(" OR ");

/**
 * Searches Scryfall for every section's cards, and sorts them into sections
 * (by key) by their oracle tags, from Tagger's bulk file. Each card is shown
 * in the printing Moxfield's own search picks, with Moxfield's image, or if
 * Moxfield doesn't find it, Scryfall's.
 */
async function sortLands(): Promise<Map<string, LandCard[]>> {
  const [found, printings] = await Promise.all([
    searchCards(LANDS_QUERY),
    searchMoxfieldCards(LANDS_QUERY).catch((error: unknown) => {
      console.error("[moxite-refinery]", error);
      return [];
    }),
  ]);
  const tags = await fetchTags(
    "oracle",
    new Map(found.map((card) => [card.id, { oracleIds: card.oracleIds, illustrationIds: [] }])),
  );
  const moxfield = new Map(printings.map((card) => [card.name, card]));
  const cards = found.map((card) => {
    const printing = moxfield.get(card.name);
    const land: LandCard = {
      id: printing?.id ?? card.id,
      name: card.name,
      set: printing?.set ?? card.set,
      cn: printing?.cn ?? card.cn,
      image: printing?.image ?? card.image,
      colorIdentity: card.colorIdentity,
      oracleText: card.oracleText,
    };
    return { land, layout: card.layout, tags: new Set(tags.get(card.id)?.map((tag) => tag.slug)) };
  });
  return new Map(
    LAND_SECTIONS.map((section) => [
      section.tag,
      cards.flatMap(({ land, layout, tags }) =>
        (!section.mdfc || layout === "modal_dfc") &&
        sectionTags(section).some((tag) => tags.has(tag))
          ? [land]
          : [],
      ),
    ]),
  );
}

let landsRequest: Promise<Map<string, LandCard[]>> | null = null;

/** `sortLands()`, once per page (but again after a failure). */
function loadLands(): Promise<Map<string, LandCard[]>> {
  if (!landsRequest) {
    const request = sortLands();
    request.catch(() => {
      if (landsRequest === request) landsRequest = null;
    });
    landsRequest = request;
  }
  return landsRequest;
}

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

/** How many colours the colour identity `identity` (`identityQuery()`) has. */
function colorCount(identity: string): number {
  return identity === "c" ? 0 : identity.length;
}

/**
 * The filters turned off at first for a deck of the colour identity
 * `identity`: "Dual" for a deck of one colour or none, and "Mono" too for a
 * colourless one, whose cards it can't play.
 */
function defaultHidden(identity: string | null): ReadonlySet<LandFilter> {
  const colors = identity === null ? 5 : colorCount(identity);
  return new Set<LandFilter>([
    ...(colors <= 1 ? (["Dual"] as const) : []),
    ...(colors === 0 ? (["Mono"] as const) : []),
  ]);
}

/** Whether `section` is shown, with the filters in `hidden` turned off: none of its own may be. */
function isShown(section: LandSection, hidden: ReadonlySet<LandFilter>): boolean {
  return !section.filters?.some((filter) => hidden.has(filter));
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
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.filter {
  box-sizing: border-box;
  padding: 0.125rem 0.75rem;
  border: 1px solid var(--bs-border-color, #dee2e6);
  border-radius: 999px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  cursor: pointer;
  transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out;
}
.filter[aria-pressed="true"] {
  border-color: var(--bs-primary, #731fa1);
  background: var(--bs-primary, #731fa1);
  color: #fff;
}
.filter:focus-visible { outline: 0; box-shadow: 0 0 0 0.25rem rgb(115 31 161 / 0.5); }
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

/** Whether `card` is within the colour identity `identity` (`identityQuery()`), as Scryfall's `id:` finds. */
function withinIdentity(card: LandCard, identity: string): boolean {
  return card.colorIdentity.every((color) => identity.includes(color.toLowerCase()));
}

interface AddMissingButtonProps {
  /** The cards it's for, or null while they're being searched for. */
  cards: LandCard[] | null;
  inDeck: ReadonlySet<string>;
  label: string;
  /** Shown instead of `label` once every one of `cards` is in the deck. */
  doneLabel: string;
  /** Whether another add is in progress. */
  saving: boolean;
  onAdd: (missing: LandCard[]) => void;
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
 * A button that opens a modal with a collapsible section per kind of land, by
 * Scryfall oracle tag (collapsed at first): the cards with it within the
 * deck's colour identity (`loadLands()`), with Moxfield's images. On decks the user can edit, each card has a button that adds a copy
 * to the mainboard, and each section one that adds those of its cards not in
 * the deck yet, or says they all are. Toggles at the top hide or show the
 * sections that list each of `LAND_FILTERS`. `GroupSummary` renders it at the end of
 * the lands group's summary row, so it gets that group as `target`.
 */
export function LandsTools({ deckId }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const dialog = useRef<HTMLDialogElement>(null);
  // The searches run once the modal is first opened.
  const [opened, setOpened] = useState(false);
  // Every section's cards, of all colours, by section key; idle until the
  // modal is first opened, and shown as searching until they're loaded.
  const [lands, setLands] = useState<Loadable<Map<string, LandCard[]>>>({ status: "idle" });
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
  const identity = deckState.status === "loaded" ? identityQuery(deckState.value) : null;
  // The sections a deck of its colours could play.
  const sections = LAND_SECTIONS.filter(
    (section) => identity === null || colorCount(identity) >= (section.minColors ?? 0),
  );
  // The filters turned off, whose sections are hidden: those for the deck's
  // colour identity (`defaultHidden()`) until the user toggles one, and again
  // whenever it changes (on another deck).
  const [filterState, setFilterState] = useState<{
    identity: string | null;
    hidden: ReadonlySet<LandFilter>;
  }>({ identity: null, hidden: defaultHidden(null) });
  const hidden = filterState.identity === identity ? filterState.hidden : defaultHidden(identity);
  const toggleFilter = (label: LandFilter) => {
    const next = new Set(hidden);
    if (!next.delete(label)) next.add(label);
    setFilterState({ identity, hidden: next });
  };
  const shownSections = sections.filter((section) => isShown(section, hidden));
  // How the last add in each section went.
  const [messages, setMessages] = useState<Record<string, string>>({});
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
    if (!opened) return;
    let current = true;
    loadLands().then(
      (value) => current && setLands({ status: "loaded", value }),
      (error: unknown) => {
        console.error("[moxite-refinery]", error);
        if (current) setLands({ status: "error", error });
      },
    );
    return () => {
      current = false;
    };
  }, [opened]);

  /** Adds a copy of each of `cards` to the mainboard, reporting under `tag`'s section. */
  async function add(tag: string, cards: LandCard[]) {
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
      <Dialog ref={dialog} title="Add Commonly-Used Lands" wide>
        <div style={styles.content}>
          <div className="filters" role="group" aria-label="Kinds of land shown">
            {LAND_FILTERS.map((filter) => (
              <Tooltip
                key={filter}
                text={sections
                  .filter((section) => section.filters?.includes(filter))
                  .map(sectionTitle)
                  .join(", ")}
              >
                <button
                  type="button"
                  className="filter"
                  aria-pressed={!hidden.has(filter)}
                  onClick={() => toggleFilter(filter)}
                >
                  {filter}
                </button>
              </Tooltip>
            ))}
          </div>
          {identity === null ? (
            <p style={styles.note}>Loading the deck…</p>
          ) : shownSections.length === 0 ? (
            <p style={styles.note}>Every kind of land is filtered out</p>
          ) : (
            shownSections.map((section) => {
              const { tag } = section;
              const title = sectionTitle(section);
              const cards =
                lands.status === "loaded"
                  ? (lands.value.get(tag) ?? []).filter((card) => withinIdentity(card, identity))
                  : null;
              // The cards the `addSome` button adds.
              const { addSome } = section;
              const someCards =
                cards && addSome ? cards.filter((card) => addSome.filter(card, identity)) : null;
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
                  {!isExpanded ? null : lands.status === "error" ? (
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
