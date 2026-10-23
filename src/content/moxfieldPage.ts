// Requests to `public/main-world.js`, which runs in the page's own world and
// can reach Moxfield's Redux store, by window message (shared between the
// worlds). Each request carries an id that its reply echoes.
const PREFIX = "moxite-refinery:";
// The page world answers at once; past this, it isn't there (or Moxfield changed).
const TIMEOUT_MS = 1000;

let nextId = 0;

function request<T>(type: string, payload?: object): Promise<T | null> {
  const id = nextId++;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(null), TIMEOUT_MS);
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: unknown; id?: unknown; result?: T } | null;
      if (event.source !== window || data?.type !== `${PREFIX}reply` || data.id !== id) return;
      finish(data.result ?? null);
    }
    function finish(result: T | null) {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(result);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: PREFIX + type, id, payload }, location.origin);
  });
}

/**
 * The `Authorization` header for the signed-in user's requests, from the
 * access token Moxfield keeps in memory (and refreshes), or null when signed out.
 */
export async function moxfieldAuthorization(): Promise<string | null> {
  return (await request<{ authorization: string | null }>("auth"))?.authorization ?? null;
}

/**
 * Has Moxfield refetch a deck into its own state, as it loads it with the
 * page, after it was edited behind its back. Returns whether it could.
 */
export async function refreshMoxfieldDeck(publicId: string): Promise<boolean> {
  return (await request<{ ok: boolean }>("refresh-deck", { publicId }))?.ok ?? false;
}
