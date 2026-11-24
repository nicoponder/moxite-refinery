import { useAtomValue, useSetAtom } from "jotai";
import type { CSSProperties } from "react";
import { canSearchDeck } from "../content/deck";
import { closeGroupMenu } from "../content/groupMenu";
import type { InjectionProps } from "../content/injector";
import { deckAtom, tagDeletionAtom, tagRenameAtom } from "../state";

// Bootstrap's `.dropdown-divider`, `.dropdown-item` and
// `.dropdown-item.text-danger`. The padding variables are set on the menu, and
// inherited. The danger item looks the same in both of Moxfield's themes, but
// its other items are recoloured by `.darkmode` rules that can't reach a
// shadow root, so the rename item copies those.
const styles = {
  divider: {
    height: 0,
    margin: "0.5rem 0",
    overflow: "hidden",
    borderTop: "1px solid currentColor",
    opacity: 0.25,
  },
  item: {
    display: "block",
    width: "100%",
    padding: "var(--bs-dropdown-item-padding-y, 0.25rem) var(--bs-dropdown-item-padding-x, 1rem)",
    border: 0,
    font: "inherit",
    textAlign: "inherit",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;

// Hover and focus colours can only be set from a stylesheet.
const stylesheet = (dark: boolean) => `
  button { background: none; }
  .rename { color: ${dark ? "#fff" : "var(--bs-dropdown-link-color, #212529)"}; }
  .rename:hover, .rename:focus-visible {
    color: ${dark ? "#bbb" : "var(--bs-dropdown-link-hover-color, #1e2125)"};
    background: ${dark ? "#222" : "var(--bs-dropdown-link-hover-bg, #e9ecef)"};
    outline: none;
  }
  .delete { color: rgb(var(--bs-danger-rgb, 220, 53, 69)); }
  .delete:hover, .delete:focus-visible { color: #fff; background: var(--bs-danger, #dc3545); outline: none; }
`;

/**
 * "Rename Moxfield Tag" and "Delete Moxfield Tag" at the end of a card group's
 * menu, for groups that are one of the deck's Moxfield card tags, on decks the
 * user can edit. They open `RenameTagDialog` (for the new name) and
 * `DeleteTagDialog` (to confirm), which `DeckTags` renders, since this
 * unmounts with the menu.
 */
export function GroupTagMenuItem({ target: groupName }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const setTagDeletion = useSetAtom(tagDeletionAtom);
  const setTagRename = useSetAtom(tagRenameAtom);
  if (deckState.status !== "loaded" || !groupName || !canSearchDeck()) return null;
  const isTag = Object.values(deckState.value.authorTags ?? {}).some((tags) =>
    tags.includes(groupName),
  );
  if (!isTag) return null;

  return (
    <>
      <style>{stylesheet(document.body.classList.contains("darkmode"))}</style>
      <div role="separator" style={styles.divider} />
      <button
        type="button"
        className="rename"
        style={styles.item}
        onClick={() => {
          closeGroupMenu();
          setTagRename(groupName);
        }}
      >
        Rename Moxfield Tag
      </button>
      <button
        type="button"
        className="delete"
        style={styles.item}
        onClick={() => {
          closeGroupMenu();
          setTagDeletion(groupName);
        }}
      >
        Delete Moxfield Tag
      </button>
    </>
  );
}
