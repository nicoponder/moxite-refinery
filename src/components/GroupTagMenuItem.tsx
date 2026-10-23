import { useAtomValue, useSetAtom } from "jotai";
import type { CSSProperties } from "react";
import { canSearchDeck } from "../content/deck";
import { closeGroupMenu } from "../content/groupMenu";
import type { InjectionProps } from "../content/injector";
import { deckAtom, tagDeletionAtom } from "../state";

// Bootstrap's `.dropdown-divider` and `.dropdown-item.text-danger`, which look
// the same in both of Moxfield's themes; its other items are recoloured by
// `.darkmode` rules that can't reach a shadow root. The padding variables are
// set on the menu, and inherited.
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
const stylesheet = `
  button { color: rgb(var(--bs-danger-rgb, 220, 53, 69)); background: none; }
  button:hover, button:focus-visible { color: #fff; background: var(--bs-danger, #dc3545); outline: none; }
`;

/**
 * "Delete Moxfield Tag" at the end of a card group's menu, for groups that are
 * one of the deck's Moxfield card tags, on decks the user can edit. It asks
 * for confirmation first (`DeleteTagDialog`, rendered by `DeckTags`, since this
 * unmounts with the menu).
 */
export function GroupTagMenuItem({ target: groupName }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const setTagDeletion = useSetAtom(tagDeletionAtom);
  if (deckState.status !== "loaded" || !groupName || !canSearchDeck()) return null;
  const isTag = Object.values(deckState.value.authorTags ?? {}).some((tags) =>
    tags.includes(groupName),
  );
  if (!isTag) return null;

  return (
    <>
      <style>{stylesheet}</style>
      <div role="separator" style={styles.divider} />
      <button
        type="button"
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
