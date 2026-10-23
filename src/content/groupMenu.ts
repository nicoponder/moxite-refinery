// A card group's header link in the deck list, in any view. Clicking it opens
// the group's menu ("Copy Section to Clipboard", "Buy All"), a Bootstrap
// dropdown that Moxfield portals to the end of `body`, so the menu itself
// doesn't say which group it's for; the last header clicked does.
export const GROUP_HEADER = "a.table-deck-row-link:has(.fa-caret-down)";

/** A group header's name and total quantity, from its text ("Lands (35)", or "Lands(35)" in some views). */
export function groupHeaderTitle(header: Element): { name: string; count: number } | null {
  const match = /^(.*?)\s*\((\d+)\)/.exec(header.textContent?.trim() ?? "");
  return match ? { name: match[1], count: Number(match[2]) } : null;
}

let lastHeader: HTMLElement | null = null;

/** Starts following which group header was clicked last. */
export function trackGroupMenus(): void {
  // Capturing, so it's seen before Moxfield's own handlers open the menu.
  document.addEventListener(
    "click",
    (event) => {
      const header = event.target instanceof Element ? event.target.closest(GROUP_HEADER) : null;
      if (header instanceof HTMLElement) lastHeader = header;
    },
    true,
  );
}

/** The header of the group whose menu is open, if it's still on the page. */
export function openGroupMenuHeader(): HTMLElement | null {
  return lastHeader?.isConnected ? lastHeader : null;
}

/** Closes the open group menu, which a second click on its header does (and would reopen a closed one). */
export function closeGroupMenu(): void {
  if (document.querySelector("body > .dropdown-menu.show")) openGroupMenuHeader()?.click();
}
