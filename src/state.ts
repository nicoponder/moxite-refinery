import { atom, createStore, type PrimitiveAtom } from "jotai";
import { fetchDeck, rememberDeck, withAuthorTag, type Deck } from "./content/deck";
import {
  fetchTaggableIds,
  fetchTags,
  type ScryfallTag,
  type TaggableIds,
} from "./content/scryfall";
import { onStorageChange, readStorage, writeStorage } from "./content/storage";

// App-wide state. Each injected component is its own React root, so they all
// share this one store (provided by the injector) rather than per-root state.
export const store = createStore();

export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; value: T }
  | { status: "error"; error: unknown };

export interface Settings {
  /**
   * Where clicking a Scryfall tag goes: a Scryfall search in a new tab, or the
   * deck's own add-card search (its search bar's magnifying glass).
   */
  tagSearch: "scryfall" | "moxfield";
  /** Whether to show art tags. When off, they aren't fetched at all. */
  showArtTags: boolean;
  /**
   * The chance, in percent (1–99), that each card group's summary finds the
   * first turn to exceed for having seen at least one of the group's cards.
   */
  drawChanceThreshold: number;
  /**
   * The last turn a group's summary looks for the threshold to be passed by;
   * past it, the summary shows the group's chance by that turn instead. Either
   * the first turn a table of the deck's bracket can be expected to win
   * (`bracketWinTurn()`), or `fixedTurnCutoff`.
   */
  turnCutoffMode: "bracket" | "fixed";
  /** The turn cutoff when `turnCutoffMode` is "fixed" (1–99). */
  fixedTurnCutoff: number;
  /** Whether a group's draw tables start at 7 cards seen (the opening hand) rather than 1. */
  drawTableFromOpeningHand: boolean;
  /** The most cards seen a group's draw tables show (7–99), within the mainboard's size. */
  drawTableMaxCardsSeen: number;
  /** The most copies a group's draw tables show (1–99), within the group's size. */
  drawTableMaxCopies: number;
  /**
   * Where each of the draw tables' colour bands after the first starts, in
   * percent (0–100, in order; 8 for the 9 bands in `components/heat.ts`). For
   * exact tables, as a share of each column's most likely outcome; for
   * cumulative tables, of the chance itself.
   */
  heatBands: number[];
}

/** Narrow bands near either end, where a chance's last few percent matter most. */
export const DEFAULT_HEAT_BANDS: readonly number[] = [5, 10, 20, 40, 60, 80, 90, 95];

const DEFAULT_SETTINGS: Settings = {
  tagSearch: "scryfall",
  showArtTags: false,
  drawChanceThreshold: 95,
  turnCutoffMode: "bracket",
  fixedTurnCutoff: 10,
  drawTableFromOpeningHand: true,
  drawTableMaxCardsSeen: 30,
  drawTableMaxCopies: 15,
  heatBands: [...DEFAULT_HEAT_BANDS],
};
const SETTINGS_KEY = "settings";

/** The extension's settings, persisted in extension storage and shared by every tab. */
export const settingsAtom = atom<Settings>(DEFAULT_SETTINGS);

/** Whether `value` is a valid set of colour band boundaries. */
function isHeatBands(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DEFAULT_HEAT_BANDS.length &&
    value.every(
      (boundary, i) =>
        typeof boundary === "number" &&
        boundary >= 0 &&
        boundary <= 100 &&
        (i === 0 || boundary >= value[i - 1]),
    )
  );
}

function parseSettings(stored: unknown): Settings {
  // Settings no longer in use (e.g. the old per-mode `exactHeatBands`) are dropped.
  const known = Object.entries(typeof stored === "object" && stored !== null ? stored : {}).filter(
    ([key]) => key in DEFAULT_SETTINGS,
  );
  const settings: Settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(known) };
  // Arrays would otherwise be trusted as stored, wrong length and all.
  if (!isHeatBands(settings.heatBands)) settings.heatBands = [...DEFAULT_HEAT_BANDS];
  return settings;
}

/** Changes some settings and saves them; other tabs pick the change up too. */
export function updateSettings(changes: Partial<Settings>): void {
  const settings = { ...store.get(settingsAtom), ...changes };
  store.set(settingsAtom, settings);
  writeStorage(SETTINGS_KEY, settings).catch((error) => console.error("[moxite-refinery]", error));
}

/** Loads the saved settings and follows changes made in other tabs. */
export function loadSettings(): void {
  readStorage(SETTINGS_KEY).then(
    (stored) => store.set(settingsAtom, parseSettings(stored)),
    (error) => console.error("[moxite-refinery]", error),
  );
  onStorageChange(SETTINGS_KEY, (stored) => store.set(settingsAtom, parseSettings(stored)));
  // Turning art tags on loads them for the current deck.
  store.sub(settingsAtom, loadArtTags);
}

/** The deck page currently open, or null when not on a deck page. */
export const deckIdAtom = atom<string | null>(null);

/** The current deck's contents, fetched whenever the deck id changes. */
export const deckAtom = atom<Loadable<Deck>>({ status: "idle" });

// Scryfall Tagger tags for every card in the current deck (all boards), keyed
// by `card.scryfall_id`, loaded after the deck itself. Cards Scryfall doesn't
// know are absent; known cards with no tags map to an empty list.

/** Oracle tags: what each card does (e.g. `ramp`, `spot-removal`). */
export const oracleTagsAtom = atom<Loadable<Map<string, ScryfallTag[]>>>({ status: "idle" });

/** Art tags: what each card's illustration shows. Stay idle while `showArtTags` is off. */
export const artTagsAtom = atom<Loadable<Map<string, ScryfallTag[]>>>({ status: "idle" });

/**
 * Runs `load` into `target`, discarding the result if the user has moved to
 * another deck by the time it settles.
 */
async function loadInto<T>(
  target: PrimitiveAtom<Loadable<T>>,
  deckId: string,
  load: () => Promise<T>,
): Promise<T | undefined> {
  store.set(target, { status: "loading" });
  try {
    const value = await load();
    if (store.get(deckIdAtom) === deckId) store.set(target, { status: "loaded", value });
    return value;
  } catch (error) {
    console.error("[moxite-refinery]", error);
    if (store.get(deckIdAtom) === deckId) store.set(target, { status: "error", error });
    return undefined;
  }
}

/** The current deck's Scryfall id lookup, shared by both tag kinds. */
let taggableIds: { deckId: string; ids: Promise<Map<string, TaggableIds>> } | null = null;

/** Loads the current deck's art tags, if they're enabled and not loaded or loading already. */
function loadArtTags(): void {
  const deckId = store.get(deckIdAtom);
  if (!store.get(settingsAtom).showArtTags || !taggableIds || taggableIds.deckId !== deckId) return;
  if (store.get(artTagsAtom).status !== "idle") return;
  const { ids } = taggableIds;
  void loadInto(artTagsAtom, deckId, () => ids.then((cards) => fetchTags("art", cards)));
}

/** Switches the app to a deck (or to none) and loads its contents and tags. */
export function setDeckId(deckId: string | null): void {
  if (store.get(deckIdAtom) === deckId) return;
  store.set(deckIdAtom, deckId);
  taggableIds = null;
  store.set(artTagsAtom, { status: "idle" });
  if (!deckId) {
    store.set(deckAtom, { status: "idle" });
    store.set(oracleTagsAtom, { status: "idle" });
    return;
  }
  store.set(oracleTagsAtom, { status: "loading" });
  void loadInto(deckAtom, deckId, () => fetchDeck(deckId)).then((deck) => {
    if (store.get(deckIdAtom) !== deckId) return;
    if (!deck) {
      const error = new Error("Deck failed to load");
      store.set(oracleTagsAtom, { status: "error", error });
      store.set(artTagsAtom, { status: "error", error });
      return;
    }
    const scryfallIds = Object.values(deck.boards).flatMap((board) =>
      Object.values(board?.cards ?? {}).map((entry) => entry.card.scryfall_id),
    );
    // One id lookup feeds both tag kinds, which then load in parallel.
    const ids = fetchTaggableIds(scryfallIds);
    taggableIds = { deckId, ids };
    void loadInto(oracleTagsAtom, deckId, () => ids.then((cards) => fetchTags("oracle", cards)));
    loadArtTags();
  });
}

/**
 * Records that the named cards of the current deck now have the Moxfield card
 * tag `tagName`, after `tagCards()` gave it to them, without refetching the deck.
 */
export function addAuthorTag(cardNames: string[], tagName: string): void {
  const deckId = store.get(deckIdAtom);
  const deck = store.get(deckAtom);
  if (!deckId || deck.status !== "loaded") return;
  const value = withAuthorTag(deck.value, cardNames, tagName);
  store.set(deckAtom, { status: "loaded", value });
  // Coming back to this deck later in the session shouldn't bring the old copy back.
  rememberDeck(deckId, value);
}
