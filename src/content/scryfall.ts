// Scryfall's API and bulk files allow cross-origin requests. Its guidelines ask
// for an Accept header and at most ~10 requests per second.
const API = "https://api.scryfall.com";
const COLLECTION_BATCH = 75; // /cards/collection's per-request limit

/** A Scryfall Tagger tag on a card. */
export interface ScryfallTag {
  slug: string;
  label: string;
  /** True when the card is tagged with a descendant of this tag, not the tag itself. */
  inherited: boolean;
}

/**
 * Oracle tags describe what a card does and attach to its oracle id; art tags
 * describe its illustration and attach to its illustration id.
 */
export type TagKind = "oracle" | "art";

const TAG_SOURCES = {
  oracle: { bulkType: "oracle-tags", key: "oracleIds" },
  art: { bulkType: "art-tags", key: "illustrationIds" },
} as const;

/** The ids Tagger tags attach to, for one Scryfall card. */
export interface TaggableIds {
  oracleIds: string[];
  illustrationIds: string[];
}

interface ScryfallFace {
  oracle_id?: string;
  illustration_id?: string;
}

interface ScryfallCard extends ScryfallFace {
  id: string;
  /** Multi-face cards may carry their ids per face instead of at the top level. */
  card_faces?: ScryfallFace[];
}

interface TagRecord {
  id: string;
  slug: string;
  label: string;
  parent_ids: string[];
  taggings: { oracle_id?: string; illustration_id?: string }[];
}

async function scryfallJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Scryfall ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** A card's id for `field`, or each face's when the card doesn't have one itself. */
function faceIds(card: ScryfallCard, field: keyof ScryfallFace): string[] {
  const top = card[field];
  if (top) return [top];
  return [
    ...new Set((card.card_faces ?? []).flatMap((face) => (face[field] ? [face[field]] : []))),
  ];
}

/**
 * Looks up the oracle and illustration ids of Scryfall cards, keyed by Scryfall
 * card id. Moxfield's card data has neither. Cards Scryfall doesn't know are absent.
 */
export async function fetchTaggableIds(scryfallIds: string[]): Promise<Map<string, TaggableIds>> {
  const unique = [...new Set(scryfallIds)];
  const result = new Map<string, TaggableIds>();
  for (let i = 0; i < unique.length; i += COLLECTION_BATCH) {
    const identifiers = unique.slice(i, i + COLLECTION_BATCH).map((id) => ({ id }));
    const { data } = await scryfallJson<{ data: ScryfallCard[] }>("/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
    });
    for (const card of data) {
      result.set(card.id, {
        oracleIds: faceIds(card, "oracle_id"),
        illustrationIds: faceIds(card, "illustration_id"),
      });
    }
  }
  return result;
}

/** Yields each line of a gzipped JSONL response without holding the whole file in memory. */
async function* gzipLines(body: ReadableStream<BufferSource>): AsyncGenerator<string> {
  const reader = body
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = (buffer + value).split("\n");
    buffer = lines.pop() ?? "";
    yield* lines;
  }
  if (buffer) yield buffer;
}

/**
 * Fetches Scryfall Tagger tags of one kind for the given cards (keyed by
 * Scryfall card id, as returned by `fetchTaggableIds`), including each tag's
 * ancestors as Scryfall's search does. Cards with no tags map to an empty list.
 *
 * The bulk files (~6 MB oracle, ~13 MB art, gzipped) have versioned URLs served
 * with a year-long cache lifetime, so the browser downloads each about once per
 * daily update.
 */
export async function fetchTags(
  kind: TagKind,
  cards: Map<string, TaggableIds>,
): Promise<Map<string, ScryfallTag[]>> {
  const { bulkType, key } = TAG_SOURCES[kind];
  const taggingKey = kind === "oracle" ? "oracle_id" : "illustration_id";
  const wanted = new Set([...cards.values()].flatMap((ids) => ids[key]));

  const { jsonl_download_uri } = await scryfallJson<{ jsonl_download_uri: string }>(
    `/bulk-data/${bulkType}`,
  );
  const res = await fetch(jsonl_download_uri);
  if (!res.ok || !res.body) throw new Error(`Scryfall ${bulkType}: HTTP ${res.status}`);

  // Every tag is kept (it's small) so ancestors can be resolved; taggings are
  // only kept for the cards we were asked about.
  const tags = new Map<string, Omit<TagRecord, "taggings">>();
  const direct = new Map<string, Set<string>>(); // oracle/illustration id → tag ids
  for await (const line of gzipLines(res.body)) {
    if (!line.trim()) continue;
    const { taggings, ...tag } = JSON.parse(line) as TagRecord;
    tags.set(tag.id, tag);
    for (const tagging of taggings) {
      const id = tagging[taggingKey];
      if (!id || !wanted.has(id)) continue;
      let set = direct.get(id);
      if (!set) direct.set(id, (set = new Set()));
      set.add(tag.id);
    }
  }

  function tagsFor(id: string): ScryfallTag[] {
    const own = direct.get(id) ?? new Set<string>();
    const inherited = new Set<string>();
    const stack = [...own];
    while (stack.length) {
      for (const parentId of tags.get(stack.pop()!)?.parent_ids ?? []) {
        if (own.has(parentId) || inherited.has(parentId)) continue;
        inherited.add(parentId);
        stack.push(parentId);
      }
    }
    const toTag = (tagId: string, isInherited: boolean): ScryfallTag[] => {
      const tag = tags.get(tagId);
      return tag ? [{ slug: tag.slug, label: tag.label, inherited: isInherited }] : [];
    };
    return [
      ...[...own].flatMap((tagId) => toTag(tagId, false)),
      ...[...inherited].flatMap((tagId) => toTag(tagId, true)),
    ];
  }

  const result = new Map<string, ScryfallTag[]>();
  for (const [scryfallId, ids] of cards) {
    // Multi-face cards combine their faces' tags; a tag that's direct on any
    // face beats the same tag inherited on another.
    const all = ids[key].flatMap(tagsFor).sort((a, b) => Number(a.inherited) - Number(b.inherited));
    const seen = new Set<string>();
    const unique = all.filter((tag) => {
      if (seen.has(tag.slug)) return false;
      seen.add(tag.slug);
      return true;
    });
    result.set(scryfallId, unique);
  }
  return result;
}
