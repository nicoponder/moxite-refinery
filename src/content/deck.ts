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
const MOXFIELD_API = "https://api2.moxfield.com";
const DECK_API = `${MOXFIELD_API}/v3/decks/all/`;

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
  /**
   * The author's card tags, by `card.name` ("Front // Back" for double-faced
   * cards), across every board; untagged cards are absent.
   */
  authorTags?: Record<string, string[]>;
  /** Sent back as `X-Deck-Version` with edits. */
  version?: number;
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

/** Replaces the deck `fetchDeck` returns for `deckId`, e.g. with a copy updated after an edit. */
export function rememberDeck(deckId: string, deck: Deck): void {
  deckRequests.set(deckId, Promise.resolve(deck));
}

/** A card tag's name, compared without case, extra spacing, or hyphens for spaces. */
export function tagKey(name: string): string {
  return name
    .trim()
    .replace(/[\s-]+/g, " ")
    .toLowerCase();
}

/** A JSON request to Moxfield's API as the signed-in user. */
async function moxfieldJson<T>(
  path: string,
  authorization: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(MOXFIELD_API + path, {
    ...init,
    headers: { Authorization: authorization, ...init?.headers },
  });
  if (!res.ok) throw new Error(`Moxfield ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * The deck as text, one board per key, as Moxfield's Bulk Edit shows it: a
 * line per entry, "1 Name (SET) 123 *F* #tag #another tag", where global tags
 * are "#!tag". It has every board but the commanders.
 */
interface BulkEdit {
  boards: Record<string, string>;
  pricingProvider: string;
}

// Each printing on its own line and flavor names kept, so saving the text
// back changes nothing but what was edited.
const BULK_EDIT_OPTIONS = { allowMultiplePrintings: true, ignoreFlavorNames: false };

/** The tags at the end of a bulk edit line, without their "#" or "#!". */
function lineTags(line: string): string[] {
  const start = line.indexOf(" #");
  if (start < 0) return [];
  return line
    .slice(start + 1)
    .split(/ (?=#)/)
    .map((tag) => tag.replace(/^#!?/, ""));
}

/** A card tag as the deck's owner sees it: a deck tag, or one of their account-wide ones. */
interface OwnerTag {
  tagName: string;
  isGlobal: boolean;
}

/**
 * Gives each named card (by `card.name`) the deck tag `tagName` in the deck
 * `publicId`, which the signed-in user must be able to edit, keeping the
 * card's other tags; cards that already have it are left alone. Returns how
 * many entries it tagged, and the names of any cards it couldn't find.
 *
 * It saves through Bulk Edit, one request for every board but the
 * commanders, which Bulk Edit leaves out and which get a request each.
 *
 * This edits the deck behind Moxfield's back: its page keeps showing the old
 * tags (and version), and would overwrite these with them if it saved those
 * cards' tags again, so have it refetch the deck afterwards
 * (`refreshMoxfieldDeck()`).
 */
export async function tagCards(
  publicId: string,
  cardNames: string[],
  tagName: string,
  authorization: string,
): Promise<{ tagged: number; missing: string[] }> {
  const id = encodeURIComponent(publicId);
  const [deck, bulkEdit] = await Promise.all([
    moxfieldJson<Deck>(`/v3/decks/all/${id}`, authorization),
    moxfieldJson<BulkEdit>(
      `/v2/decks/${id}/bulk-edit?${new URLSearchParams(Object.entries(BULK_EDIT_OPTIONS).map(([k, v]) => [k, String(v)]))}`,
      authorization,
    ),
  ]);
  const wanted = new Set(cardNames);
  const key = tagKey(tagName);
  const editHeaders = {
    "Content-Type": "application/json",
    "X-Public-Deck-ID": publicId,
    "X-Deck-Version": String(deck.version ?? 0),
  };
  let tagged = 0;
  const found = new Set<string>();

  // Lines are found by printing, "(SET) 123" after the name, since the name
  // they're written under isn't always `card.name`: printings with a flavor
  // name use it ("Swift Wind, Steed of She-Ra" for Emiel the Blessed).
  const printing = (set: string, cn: string) => `${set.toUpperCase()} ${cn}`;
  const linePrinting = (line: string) => {
    const match = /^\d+x? .+? \(([A-Za-z0-9]+)\) (\S+)/.exec(line);
    return match ? printing(match[1], match[2]) : null;
  };
  const wantedPrintings = new Map(
    Object.entries(deck.boards)
      .filter(([board]) => board !== "commanders")
      .flatMap(([, board]) => Object.values(board?.cards ?? {}))
      .filter((entry) => wanted.has(entry.card.name))
      .map((entry) => [printing(entry.card.set, entry.card.cn), entry.card.name]),
  );
  let changed = false;
  const boards = Object.fromEntries(
    Object.entries(bulkEdit.boards).map(([board, text]) => [
      board,
      text
        .split("\n")
        .map((line) => {
          const linePrint = linePrinting(line);
          const name = linePrint && wantedPrintings.get(linePrint);
          if (!name) return line;
          found.add(name);
          if (lineTags(line).some((tag) => tagKey(tag) === key)) return line;
          changed = true;
          tagged++;
          return `${line.trimEnd()} #${tagName}`;
        })
        .join("\n"),
    ]),
  );
  if (changed) {
    const result = await moxfieldJson<{ isSuccessful?: boolean }>(
      `/v3/decks/${id}/bulk-edit`,
      authorization,
      {
        method: "PUT",
        headers: editHeaders,
        // As Moxfield's own Bulk Edit saves.
        body: JSON.stringify({
          boards,
          pricingProvider: bulkEdit.pricingProvider,
          usePrefPrintings: true,
          ...BULK_EDIT_OPTIONS,
        }),
      },
    );
    if (!result.isSuccessful) throw new Error("Moxfield didn't accept the bulk edit");
  }

  // Bulk Edit leaves the commanders out, so they're tagged one by one. Each
  // request sends the card's whole list of tags, as Moxfield's own tag editor
  // does ("#name" for deck tags, "#!name" for global ones), so this needs the
  // owner's view of the deck, the only one that tells the two apart.
  const commanders = Object.values(deck.boards.commanders?.cards ?? {})
    .map((entry) => entry.card)
    .filter((card) => wanted.has(card.name));
  if (commanders.length) {
    const { tags } = await moxfieldJson<{ tags?: Record<string, OwnerTag[] | undefined> }>(
      `/v1/decks/all/${id}/viewer`,
      authorization,
    );
    for (const card of commanders) {
      found.add(card.name);
      const own = tags?.[card.name] ?? [];
      if (own.some((tag) => tagKey(tag.tagName) === key)) continue;
      await moxfieldJson<unknown>(
        `/v2/decks/${encodeURIComponent(deck.id)}/cards/${encodeURIComponent(card.id)}/tags`,
        authorization,
        {
          method: "PUT",
          headers: editHeaders,
          body: JSON.stringify({
            tags: [...own.map((tag) => (tag.isGlobal ? "#!" : "#") + tag.tagName), `#${tagName}`],
          }),
        },
      );
      tagged++;
    }
  }
  return { tagged, missing: [...wanted].filter((name) => !found.has(name)) };
}

/** A copy of `deck` whose `authorTags` give the named cards the tag `tagName`, as `tagCards()` does. */
export function withAuthorTag(deck: Deck, cardNames: string[], tagName: string): Deck {
  const authorTags = { ...deck.authorTags };
  for (const name of cardNames) {
    const tags = authorTags[name] ?? [];
    if (!tags.some((tag) => tagKey(tag) === tagKey(tagName))) authorTags[name] = [...tags, tagName];
  }
  return { ...deck, authorTags };
}
