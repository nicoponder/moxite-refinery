import { readAllStorage, readStorage, removeStorage, writeStorage } from "./storage";

// Results kept in extension storage, shared by every tab, under this prefix
// plus their own key, as `{ expires, value }` with `expires` a time in ms.
const PREFIX = "cache:";

export const DAY_MS = 24 * 60 * 60 * 1000;

interface Entry {
  expires: number;
  value: unknown;
}

function isFresh(stored: unknown): stored is Entry {
  return (
    typeof stored === "object" &&
    stored !== null &&
    typeof (stored as Entry).expires === "number" &&
    (stored as Entry).expires > Date.now()
  );
}

// Loads in flight or done during this page's life, so each result is loaded
// (or read from storage) once per page until it expires.
const pending = new Map<string, { promise: Promise<unknown>; expires: number }>();

let swept = false;

/** Removes the stored results that have expired, once per page. */
async function sweep(): Promise<void> {
  if (swept) return;
  swept = true;
  const stale = Object.entries(await readAllStorage()).flatMap(([key, stored]) =>
    key.startsWith(PREFIX) && !isFresh(stored) ? [key] : [],
  );
  if (stale.length) await removeStorage(stale);
}

/**
 * `load()`'s result, kept under `key` for `maxAgeMs` in extension storage (so
 * every tab shares it) and in memory meanwhile. A failed load isn't
 * kept, so the next call tries again. The result must be JSON-serializable.
 */
export function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
  const storageKey = PREFIX + key;
  const existing = pending.get(storageKey);
  if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
  // Until it's loaded, a load in flight is shared however long it takes.
  const memo = { promise: Promise.resolve() as Promise<unknown>, expires: Infinity };
  const promise = (async () => {
    // Storage only saves requests: if it fails, load afresh.
    const stored = await readStorage(storageKey).catch(() => undefined);
    if (isFresh(stored)) {
      memo.expires = stored.expires;
      return stored.value as T;
    }
    const value = await load();
    const entry: Entry = { expires: Date.now() + maxAgeMs, value };
    memo.expires = entry.expires;
    sweep()
      .then(() => writeStorage(storageKey, entry))
      .catch((error: unknown) => console.error("[moxite-refinery]", error));
    return value;
  })();
  memo.promise = promise;
  pending.set(storageKey, memo);
  promise.catch(() => {
    if (pending.get(storageKey) === memo) pending.delete(storageKey);
  });
  return promise;
}
