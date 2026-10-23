import { Provider } from "jotai";
import type { ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setDeckId, store } from "../state";
import { getDeckId } from "./deck";

export interface InjectionProps {
  deckId: string;
  /** What the injection is about, from its `target` function; null if it has none. */
  target: string | null;
}

export interface Injection {
  /** Unique key, also written to the host element as `data-moxite-refinery`. */
  id: string;
  /**
   * Finds the element to insert next to. Returning null means "not on the page
   * yet"; returning an array mounts a separate copy of the component next to
   * each element.
   */
  anchor: () => Element | Element[] | null;
  /** Where the component goes relative to the anchor. */
  position: InsertPosition;
  /**
   * Optionally identifies what the anchor's part of the page is about (e.g. the
   * card a modal shows), read from the DOM. The component re-renders when it changes.
   */
  target?: (anchor: Element) => string | null;
  /**
   * Optional classes for the host element, which sits in Moxfield's DOM. Its
   * inherited styles (colour, font) reach into the shadow root, so Moxfield's
   * own Bootstrap classes (e.g. `small text-muted`) let a component match the
   * page's text exactly, in both themes.
   */
  hostClassName?: string;
  component: ComponentType<InjectionProps>;
}

function render(root: Root, injection: Injection, deckId: string, target: string | null) {
  root.render(
    <Provider store={store}>
      <injection.component deckId={deckId} target={target} />
    </Provider>,
  );
}

/** Whether `host` is still where `position` put it relative to `anchor`. */
function inPlace(host: Element, anchor: Element, position: InsertPosition): boolean {
  switch (position) {
    case "beforebegin":
      return anchor.previousSibling === host;
    case "afterbegin":
      return anchor.firstChild === host;
    case "beforeend":
      return anchor.lastChild === host;
    case "afterend":
      return anchor.nextSibling === host;
  }
}

interface Mounted {
  host: HTMLElement;
  root: Root;
  target: string | null;
}

/**
 * Keeps each injection's component mounted while its anchor exists.
 *
 * Moxfield is a single-page app that renders and replaces its DOM at will, so
 * rather than mounting once, this re-checks every anchor whenever the page's
 * DOM changes and mounts, moves or unmounts components to match.
 */
export function startInjector(injections: Injection[]): void {
  // Per injection id, the mounted copies keyed by their anchor.
  const mounted = new Map<string, Map<Element, Mounted>>(
    injections.map((injection) => [injection.id, new Map()]),
  );
  let currentDeckId: string | null = null;

  function unmount(entries: Map<Element, Mounted>, anchor: Element) {
    const entry = entries.get(anchor);
    if (!entry) return;
    entry.root.unmount();
    entry.host.remove();
    entries.delete(anchor);
  }

  function mount(injection: Injection, anchor: Element, deckId: string, target: string | null) {
    // Each component lives in its own shadow root so Moxfield's CSS can't
    // leak in and ours can't leak out. `display: contents` makes the host
    // invisible to layout, as is the root's container, so the component sits
    // directly in the page's flow (e.g. inline in a line of text).
    const host = document.createElement("div");
    host.dataset.moxiteRefinery = injection.id;
    if (injection.hostClassName) host.className = injection.hostClassName;
    host.style.display = "contents";
    const container = document.createElement("div");
    container.style.display = "contents";
    host.attachShadow({ mode: "open" }).appendChild(container);
    anchor.insertAdjacentElement(injection.position, host);

    const root = createRoot(container);
    render(root, injection, deckId, target);
    mounted.get(injection.id)!.set(anchor, { host, root, target });
  }

  function reconcile() {
    const deckId = getDeckId();
    setDeckId(deckId);
    if (!deckId) {
      // Navigated away from a deck page within the SPA.
      for (const entries of mounted.values()) {
        for (const anchor of entries.keys()) unmount(entries, anchor);
      }
      currentDeckId = null;
      return;
    }
    const deckChanged = deckId !== currentDeckId;
    currentDeckId = deckId;

    for (const injection of injections) {
      const found = injection.anchor();
      const anchors = new Set(found === null ? [] : Array.isArray(found) ? found : [found]);
      const entries = mounted.get(injection.id)!;

      for (const [anchor, entry] of entries) {
        if (!anchors.has(anchor) || !entry.host.isConnected) unmount(entries, anchor);
      }

      for (const anchor of anchors) {
        const target = injection.target?.(anchor) ?? null;
        const current = entries.get(anchor);
        if (!current) {
          mount(injection, anchor, deckId, target);
          continue;
        }
        // Moxfield inserts its own elements without regard for ours, e.g.
        // appending a section's content when it expands, which can leave a
        // component on the wrong side of it.
        if (!inPlace(current.host, anchor, injection.position)) {
          anchor.insertAdjacentElement(injection.position, current.host);
        }
        if (deckChanged || target !== current.target) {
          current.target = target;
          render(current.root, injection, deckId, target);
        }
      }
    }
  }

  // Batch bursts of mutations into one reconcile per frame. Mutations inside
  // our shadow roots aren't observed, so rendering doesn't retrigger this.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reconcile();
    });
  }

  // `src` changes are watched too, since targets are often read from images,
  // and text changes, since targets can be read from text (e.g. a card's quantity).
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ["src"],
  });
  window.addEventListener("popstate", schedule);
  reconcile();
}
