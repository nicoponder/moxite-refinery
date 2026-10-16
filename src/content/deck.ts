const DECK_PATH = /^\/decks\/([A-Za-z0-9_-]+)\/?$/;

// Listing pages that share the /decks/ prefix with actual decks.
const NON_DECK_PATHS = new Set(["public", "personal", "following", "liked"]);

/** Returns the deck's unique identifier from a Moxfield deck path, or null. */
export function getDeckId(pathname: string = location.pathname): string | null {
  const id = DECK_PATH.exec(pathname)?.[1];
  return id && !NON_DECK_PATHS.has(id) ? id : null;
}

/**
 * Whether the page has the add-card search bar ("Find and add cards…"), which
 * Moxfield only shows on decks the user can edit.
 */
export function canSearchDeck(): boolean {
  return document.getElementById("deckbox-search") !== null;
}

/**
 * The add-card search page for `query`, where the search bar's magnifying
 * glass goes. It 404s on decks the user can't edit. Moxfield's search accepts
 * Scryfall syntax, including `otag:` and `atag:`.
 */
export function deckSearchPath(deckId: string, query: string): string {
  return `/decks/${deckId}/search?q=${encodeURIComponent(query)}`;
}

/**
 * Navigates within Moxfield's single-page app without reloading it. Its router
 * follows `popstate`, which content scripts can dispatch since window events
 * are shared with the page. Open modals close as the page changes.
 */
export function navigateInApp(path: string): void {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
}

// Moxfield's undocumented API, the same endpoint its deck page loads from.
// Only the fields we rely on are typed; the real payload has many more.
const DECK_API = "https://api2.moxfield.com/v3/decks/all/";

export interface Card {
  /** Moxfield's own card id, not Scryfall's. */
  id: string;
  scryfall_id: string;
  name: string;
  set: string;
  /** Collector number. */
  cn: string;
  type_line: string;
  mana_cost: string;
  cmc: number;
  color_identity: string[];
  /** Present on multi-face cards; each face has its own Moxfield id. */
  card_faces?: { id: string }[];
}

export interface DeckEntry {
  quantity: number;
  boardType: string;
  card: Card;
}

export interface DeckBoard {
  /** Total copies across all entries, not the number of entries. */
  count: number;
  /** Keyed by Moxfield's uniqueCardId. */
  cards: Record<string, DeckEntry>;
}

export interface Deck {
  /** Moxfield's short internal id, not the one in the URL. */
  id: string;
  publicId: string;
  name: string;
  format: string;
  /**
   * The deck's Commander bracket (1–5): the one its owner set (`userBracket`),
   * else Moxfield's own estimate (`autoBracket`). May be absent.
   */
  bracket?: number;
  /** Whether the owner opted the deck out of brackets. */
  ignoreBrackets?: boolean;
  /** e.g. mainboard, sideboard, commanders, companions, maybeboard. Any may be absent. */
  boards: Record<string, DeckBoard | undefined>;
}

// The first turn someone at the table can be expected to win, per Commander bracket.
const BRACKET_WIN_TURNS: Partial<Record<number, number>> = { 1: 9, 2: 8, 3: 6, 4: 4, 5: 4 };
// For decks without a bracket, assume the fastest tables.
const DEFAULT_WIN_TURN = 4;

/**
 * The first turn someone can be expected to win at a table of the deck's
 * Commander bracket, and that bracket, or null (and turn 4) if it has none:
 * opted out, not yet estimated, or not a Commander deck.
 */
export function bracketWinTurn(deck: Deck): { bracket: number | null; turn: number } {
  const turn =
    deck.format === "commander" && !deck.ignoreBrackets && deck.bracket !== undefined
      ? BRACKET_WIN_TURNS[deck.bracket]
      : undefined;
  return turn === undefined
    ? { bracket: null, turn: DEFAULT_WIN_TURN }
    : { bracket: deck.bracket!, turn };
}

const deckRequests = new Map<string, Promise<Deck>>();

/**
 * Fetches a deck by the id in its URL. Concurrent and repeat calls for the same
 * deck share one request; a failed request is forgotten so it can be retried.
 */
export function fetchDeck(deckId: string): Promise<Deck> {
  let request = deckRequests.get(deckId);
  if (!request) {
    request = fetch(DECK_API + encodeURIComponent(deckId)).then((res) => {
      if (!res.ok) throw new Error(`Moxfield deck ${deckId}: HTTP ${res.status}`);
      return res.json() as Promise<Deck>;
    });
    request.catch(() => deckRequests.delete(deckId));
    deckRequests.set(deckId, request);
  }
  return request;
}
