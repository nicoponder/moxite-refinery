// Runs in the page's own JavaScript world (`"world": "MAIN"`), where
// Moxfield's Redux store can be reached, and answers the content script's
// requests for it by window message (window messages are shared between the
// worlds). Only the two requests below are handled. See
// `src/content/moxfieldPage.ts`.
(() => {
  const PREFIX = "moxite-refinery:";

  let store = null;

  /** Moxfield's store, from the react-redux Provider a few fibers below its root. */
  const findStore = () => {
    if (store) return store;
    const root = document.getElementById("js-reactroot");
    const key = root && Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
    const stack = key ? [root[key]] : [];
    while (stack.length) {
      const fiber = stack.pop();
      const candidate = fiber.memoizedProps?.store;
      if (typeof candidate?.getState === "function" && typeof candidate.dispatch === "function") {
        return (store = candidate);
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return null;
  };

  const handlers = {
    // The signed-in user's access token, which Moxfield keeps current.
    auth: () => {
      const token = findStore()?.getState().user?.accessToken;
      return { authorization: token ? `Bearer ${token}` : null };
    },
    // Has Moxfield refetch a deck and its owner's view of it into its store,
    // with its own actions (as its action creators make them), after the
    // content script edited it.
    "refresh-deck": ({ publicId }) => {
      const found = findStore();
      if (!found || typeof publicId !== "string") return { ok: false };
      const id = encodeURIComponent(publicId);
      found.dispatch({
        type: "GET_PUBLIC_DECK",
        deckId: publicId,
        request: { url: `/v3/decks/all/${id}`, method: "GET" },
      });
      found.dispatch({
        type: "GET_VIEWER_INFO",
        publicId,
        authenticate: true,
        request: { url: `/v1/decks/all/${id}/viewer`, method: "GET" },
      });
      return { ok: true };
    },
  };

  window.addEventListener("message", (event) => {
    const { type, id, payload } = (event.source === window && event.data) || {};
    if (typeof type !== "string" || !type.startsWith(PREFIX) || id === undefined) return;
    const handler = Object.hasOwn(handlers, type.slice(PREFIX.length))
      ? handlers[type.slice(PREFIX.length)]
      : null;
    if (!handler) return;
    window.postMessage(
      { type: `${PREFIX}reply`, id, result: handler(payload ?? {}) },
      location.origin,
    );
  });
})();
