import { cached, DAY_MS } from "./cache";
import { moxfieldAuthorization } from "./moxfieldPage";

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
  return document.querySelector('[data-testid="search-bar-input"]') !== null;
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
  /** The colours of the deck's cards' identities, as "W", "U", "B", "R", "G"; empty if colourless. */
  colorIdentity?: string[];
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

// How long to wait for Moxfield to restore its sign-in on page load.
const AUTH_WAIT_MS = 5000;
const AUTH_POLL_MS = 250;

/** The signed-in user's `Authorization` header once Moxfield has one, or null if it doesn't within `AUTH_WAIT_MS`. */
async function awaitMoxfieldAuthorization(): Promise<string | null> {
  const deadline = Date.now() + AUTH_WAIT_MS;
  for (;;) {
    const authorization = await moxfieldAuthorization();
    if (authorization || Date.now() >= deadline) return authorization;
    await new Promise((resolve) => setTimeout(resolve, AUTH_POLL_MS));
  }
}

async function getDeck(deckId: string): Promise<Deck> {
  const get = (authorization: string | null) =>
    fetch(DECK_API + encodeURIComponent(deckId), {
      headers: authorization ? { Authorization: authorization } : {},
    });
  const authorization = await moxfieldAuthorization();
  let res = await get(authorization);
  // Private decks 404 without their owner's sign-in, which Moxfield may not
  // have restored yet when the page has only just loaded.
  if (res.status === 404 && !authorization) {
    const restored = await awaitMoxfieldAuthorization();
    if (restored) res = await get(restored);
  }
  if (!res.ok) throw new Error(`Moxfield deck ${deckId}: HTTP ${res.status}`);
  return res.json() as Promise<Deck>;
}

/**
 * Fetches a deck by the id in its URL, with the user's Moxfield sign-in if
 * they're signed in, as private decks need. Concurrent and repeat calls for the
 * same deck share one request; a failed request is forgotten so it can be retried.
 */
export function fetchDeck(deckId: string): Promise<Deck> {
  let request = deckRequests.get(deckId);
  if (!request) {
    request = getDeck(deckId);
    request.catch(() => deckRequests.delete(deckId));
    deckRequests.set(deckId, request);
  }
  return request;
}

/** Has the next `fetchDeck` for `deckId` fetch it again, e.g. after cards were added to it. */
export function forgetDeck(deckId: string): void {
  deckRequests.delete(deckId);
}

/** Replaces the deck `fetchDeck` returns for `deckId`, e.g. with a copy updated after an edit. */
export function rememberDeck(deckId: string, deck: Deck): void {
  deckRequests.set(deckId, Promise.resolve(deck));
}

/** A card from Moxfield's card search: Moxfield's printing of it, and its image. */
export interface MoxfieldSearchCard {
  /** Moxfield's own card id. */
  id: string;
  /** "Front // Back" for multi-face cards. */
  name: string;
  set: string;
  /** Collector number. */
  cn: string;
  /** Its (front face's) image on Moxfield's CDN, as on the deck page. */
  image: string;
}

interface MoxfieldSearchPage {
  data: {
    id: string;
    name: string;
    set: string;
    cn: string;
    layout: string;
    image_seq?: number;
    card_faces?: { id: string; image_seq?: number }[];
  }[];
  hasMore: boolean;
}

// The layouts whose faces are on separate sides of the card, so each face has
// its own image, under the face's id.
const DOUBLE_SIDED_LAYOUTS = new Set([
  "modal_dfc",
  "transform",
  "reversible_card",
  "double_faced_token",
  "art_series",
]);

/**
 * Every card matching a search `query` on Moxfield's card search (Scryfall's
 * syntax, one printing of each card, as its add-card search picks), across all
 * of its pages. It needs no sign-in. Results are cached by query for a day
 * (`cached()`), in every tab.
 */
export function searchMoxfieldCards(query: string): Promise<MoxfieldSearchCard[]> {
  return cached(`moxfield-search:${query}`, DAY_MS, async () => {
    const cards: MoxfieldSearchCard[] = [];
    for (let page = 1, hasMore = true; hasMore; page++) {
      const params = new URLSearchParams({ q: query, page: String(page) });
      const res = await fetch(`${MOXFIELD_API}/v2/cards/search?${params}`);
      // A search with no results may be a 404, as on Scryfall.
      if (res.status === 404) break;
      if (!res.ok) throw new Error(`Moxfield search ${query}: HTTP ${res.status}`);
      const result = (await res.json()) as MoxfieldSearchPage;
      for (const card of result.data) {
        const face = DOUBLE_SIDED_LAYOUTS.has(card.layout) ? card.card_faces?.[0] : undefined;
        const [imageId, seq] = face
          ? [`face-${face.id}`, face.image_seq]
          : [card.id, card.image_seq];
        cards.push({
          id: card.id,
          name: card.name,
          set: card.set,
          cn: card.cn,
          image: `https://assets.moxfield.net/cards/card-${imageId}-normal.webp${seq ? `?${seq}` : ""}`,
        });
      }
      hasMore = result.hasMore && result.data.length > 0;
    }
    return cards;
  });
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

// Each edit reads the deck and writes the whole of it back, so edits run one
// at a time, each from the deck as the previous one left it.
let editQueue: Promise<unknown> = Promise.resolve();

/** Runs `edit` once the edits before it have finished, whether or not they succeeded. */
function serialized<T>(edit: () => Promise<T>): Promise<T> {
  const result = editQueue.then(edit);
  editQueue = result.catch(() => undefined);
  return result;
}

/** The deck `publicId` as its owner sees it, and as Bulk Edit text. */
async function getBulkEdit(
  publicId: string,
  authorization: string,
): Promise<{ deck: Deck; bulkEdit: BulkEdit }> {
  const id = encodeURIComponent(publicId);
  const options = new URLSearchParams(
    Object.entries(BULK_EDIT_OPTIONS).map(([k, v]) => [k, String(v)]),
  );
  const [deck, bulkEdit] = await Promise.all([
    moxfieldJson<Deck>(`/v3/decks/all/${id}`, authorization),
    moxfieldJson<BulkEdit>(`/v2/decks/${id}/bulk-edit?${options}`, authorization),
  ]);
  return { deck, bulkEdit };
}

/** The headers Moxfield's own edits send. */
function editHeaders(deck: Deck): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Public-Deck-ID": deck.publicId,
    "X-Deck-Version": String(deck.version ?? 0),
  };
}

/** Saves `boards`, an edited copy of `bulkEdit.boards`, as Moxfield's own Bulk Edit saves. */
async function putBulkEdit(
  deck: Deck,
  bulkEdit: BulkEdit,
  boards: Record<string, string>,
  authorization: string,
): Promise<void> {
  const result = await moxfieldJson<{ isSuccessful?: boolean }>(
    `/v3/decks/${encodeURIComponent(deck.publicId)}/bulk-edit`,
    authorization,
    {
      method: "PUT",
      headers: editHeaders(deck),
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

// Lines are found by printing, "(SET) 123" after the name, since the name
// they're written under isn't always `card.name`: printings with a flavor
// name use it ("Swift Wind, Steed of She-Ra" for Emiel the Blessed).
const printing = (set: string, cn: string) => `${set.toUpperCase()} ${cn}`;
const LINE = /^(\d+)x? (.+?) \(([A-Za-z0-9]+)\) (\S+)/;
function linePrinting(line: string): string | null {
  const match = LINE.exec(line);
  return match ? printing(match[3], match[4]) : null;
}

/** A bulk edit line split into the entry and its tags ("#tag", or "#!tag" for global ones). */
function splitLine(line: string): { entry: string; tags: string[] } {
  const start = line.indexOf(" #");
  if (start < 0) return { entry: line.trimEnd(), tags: [] };
  return {
    entry: line.slice(0, start),
    tags: line
      .slice(start + 1)
      .trimEnd()
      .split(/ (?=#)/),
  };
}

/** A tag's name, without its "#" or "#!". */
const tagName = (tag: string) => tag.replace(/^#!?/, "");

/** A card tag as the deck's owner sees it: a deck tag, or one of their account-wide ones. */
interface OwnerTag {
  tagName: string;
  isGlobal: boolean;
}

/**
 * Changes cards' tags in the deck `publicId`, which the signed-in user must be
 * able to edit: `edit` gets each card's tags, as "#tag" (deck tags) or "#!tag"
 * (global ones), and returns their new list, or null to leave them be. It sees
 * only the named cards (by `card.name`), or every card if `cardNames` is
 * omitted. Returns how many entries it changed, and the names of any named
 * cards it couldn't find.
 *
 * It saves through Bulk Edit, one request for every board but the
 * commanders, which Bulk Edit leaves out and which get a request each.
 *
 * This edits the deck behind Moxfield's back: its page keeps showing the old
 * tags (and version), and would overwrite these with them if it saved those
 * cards' tags again, so have it refetch the deck afterwards
 * (`refreshMoxfieldDeck()`).
 */
function editCardTags(
  publicId: string,
  authorization: string,
  edit: (tags: string[]) => string[] | null,
  cardNames?: string[],
): Promise<{ changed: number; missing: string[] }> {
  return serialized(() => editCardTagsNow(publicId, authorization, edit, cardNames));
}

async function editCardTagsNow(
  publicId: string,
  authorization: string,
  edit: (tags: string[]) => string[] | null,
  cardNames?: string[],
): Promise<{ changed: number; missing: string[] }> {
  const id = encodeURIComponent(publicId);
  const { deck, bulkEdit } = await getBulkEdit(publicId, authorization);
  const wanted = (name: string) => !cardNames || cardNames.includes(name);
  let changed = 0;
  const found = new Set<string>();

  const printings = new Map(
    Object.entries(deck.boards)
      .filter(([board]) => board !== "commanders")
      .flatMap(([, board]) => Object.values(board?.cards ?? {}))
      .filter((entry) => wanted(entry.card.name))
      .map((entry) => [printing(entry.card.set, entry.card.cn), entry.card.name]),
  );
  const boards = Object.fromEntries(
    Object.entries(bulkEdit.boards).map(([board, text]) => [
      board,
      text
        .split("\n")
        .map((line) => {
          const linePrint = linePrinting(line);
          const name = linePrint && printings.get(linePrint);
          if (!name) return line;
          found.add(name);
          const { entry, tags } = splitLine(line);
          const edited = edit(tags);
          if (!edited) return line;
          changed++;
          return [entry, ...edited].join(" ");
        })
        .join("\n"),
    ]),
  );
  if (changed) await putBulkEdit(deck, bulkEdit, boards, authorization);

  // Bulk Edit leaves the commanders out, so they're edited one by one. Each
  // request sends the card's whole list of tags, as Moxfield's own tag editor
  // does, so this needs the owner's view of the deck, the only one that tells
  // deck tags from global ones.
  const commanders = Object.values(deck.boards.commanders?.cards ?? {})
    .map((entry) => entry.card)
    .filter((card) => wanted(card.name));
  if (commanders.length) {
    const { tags } = await moxfieldJson<{ tags?: Record<string, OwnerTag[] | undefined> }>(
      `/v1/decks/all/${id}/viewer`,
      authorization,
    );
    for (const card of commanders) {
      found.add(card.name);
      const edited = edit(
        (tags?.[card.name] ?? []).map((tag) => (tag.isGlobal ? "#!" : "#") + tag.tagName),
      );
      if (!edited) continue;
      await moxfieldJson<unknown>(
        `/v2/decks/${encodeURIComponent(deck.id)}/cards/${encodeURIComponent(card.id)}/tags`,
        authorization,
        { method: "PUT", headers: editHeaders(deck), body: JSON.stringify({ tags: edited }) },
      );
      changed++;
    }
  }
  return { changed, missing: (cardNames ?? []).filter((name) => !found.has(name)) };
}

/**
 * Gives each named card (by `card.name`) the deck tag `name`, keeping its other
 * tags; cards that already have it are left alone. See `editCardTags()`.
 */
export async function tagCards(
  publicId: string,
  cardNames: string[],
  name: string,
  authorization: string,
): Promise<{ tagged: number; missing: string[] }> {
  const { changed, missing } = await editCardTags(
    publicId,
    authorization,
    (tags) =>
      tags.some((tag) => tagKey(tagName(tag)) === tagKey(name)) ? null : [...tags, `#${name}`],
    cardNames,
  );
  return { tagged: changed, missing };
}

/**
 * Removes the card tag `name` (exactly, deck or global) from every card in the
 * deck, keeping their other tags. Returns how many entries had it. See
 * `editCardTags()`.
 */
export async function deleteCardTag(
  publicId: string,
  name: string,
  authorization: string,
): Promise<number> {
  const { changed } = await editCardTags(publicId, authorization, (tags) => {
    const kept = tags.filter((tag) => tagName(tag) !== name);
    return kept.length < tags.length ? kept : null;
  });
  return changed;
}

/**
 * A card's tags (as `editCardTags()` gives them) with the tag `from` renamed
 * to `to`, keeping whether it's a deck ("#") or global ("#!") tag and where it
 * is in the list, or null if the card doesn't have `from`. A card that already
 * has a tag named `to` (by `tagKey()`) just loses `from`.
 */
export function renamedTags(tags: string[], from: string, to: string): string[] | null {
  if (!tags.some((tag) => tagName(tag) === from)) return null;
  const hasTo = tags.some((tag) => tagName(tag) !== from && tagKey(tagName(tag)) === tagKey(to));
  const renamed = tags.flatMap((tag) => {
    if (tagName(tag) !== from) return [tag];
    return hasTo ? [] : [(tag.startsWith("#!") ? "#!" : "#") + to];
  });
  return [...new Set(renamed)];
}

/**
 * Renames the card tag `from` (exactly, deck or global) to `to` on every card
 * in the deck, keeping their other tags (see `renamedTags()`). Returns how
 * many entries had it. A global tag is renamed on this deck's cards only. See
 * `editCardTags()`.
 */
export async function renameCardTag(
  publicId: string,
  from: string,
  to: string,
  authorization: string,
): Promise<number> {
  const { changed } = await editCardTags(publicId, authorization, (tags) =>
    renamedTags(tags, from, to),
  );
  return changed;
}

/**
 * Why `name` can't be a card tag, or null if it can. Bulk Edit separates a
 * line's tags by " #", so a name can't have a "#" in it.
 */
export function invalidTagName(name: string): string | null {
  if (!name.trim()) return "Enter a name";
  if (name.includes("#")) return "Tag names can't contain #";
  return null;
}

/** A printing to add to a deck, e.g. from a Scryfall search. */
export interface NewCard {
  /** The card's name; double-faced cards' "Front // Back" is written as Bulk Edit writes it, "Front / Back". */
  name: string;
  set: string;
  /** Collector number. */
  cn: string;
}

/**
 * Adds a copy of each card to the mainboard of the deck `publicId`, which the
 * signed-in user must be able to edit, through Bulk Edit: a line already there
 * for the same printing gets its quantity raised, and others get a new line.
 *
 * Like `editCardTags()`, this edits the deck behind Moxfield's back, so have
 * it refetch the deck afterwards (`refreshMoxfieldDeck()`).
 */
export function addCards(publicId: string, cards: NewCard[], authorization: string): Promise<void> {
  return serialized(async () => {
    const { deck, bulkEdit } = await getBulkEdit(publicId, authorization);
    const lines = (bulkEdit.boards.mainboard ?? "").split("\n").filter((line) => line.trim());
    for (const card of cards) {
      const wanted = printing(card.set, card.cn);
      const index = lines.findIndex((line) => linePrinting(line) === wanted);
      if (index >= 0) {
        lines[index] = lines[index].replace(/^(\d+)/, (quantity) => String(Number(quantity) + 1));
      } else {
        lines.push(`1 ${card.name.replace(" // ", " / ")} (${card.set.toUpperCase()}) ${card.cn}`);
      }
    }
    const boards = { ...bulkEdit.boards, mainboard: lines.join("\n") };
    await putBulkEdit(deck, bulkEdit, boards, authorization);
  });
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

/** A copy of `deck` whose `authorTags` have the tag `from` renamed to `to`, as `renameCardTag()` leaves it. */
export function withRenamedAuthorTag(deck: Deck, from: string, to: string): Deck {
  const authorTags = Object.fromEntries(
    Object.entries(deck.authorTags ?? {}).map(([card, tags]) => {
      if (!tags.includes(from)) return [card, tags];
      const hasTo = tags.some((tag) => tag !== from && tagKey(tag) === tagKey(to));
      const renamed = tags.flatMap((tag) => (tag !== from ? [tag] : hasTo ? [] : [to]));
      return [card, [...new Set(renamed)]];
    }),
  );
  return { ...deck, authorTags };
}

/** A copy of `deck` whose `authorTags` no longer have the tag `tagName`, as `deleteCardTag()` leaves it. */
export function withoutAuthorTag(deck: Deck, tagName: string): Deck {
  const authorTags = Object.fromEntries(
    Object.entries(deck.authorTags ?? {})
      .map(([card, tags]) => [card, tags.filter((tag) => tag !== tagName)] as const)
      .filter(([, tags]) => tags.length),
  );
  return { ...deck, authorTags };
}
