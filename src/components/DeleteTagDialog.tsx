import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { deleteCardTag } from "../content/deck";
import { moxfieldAuthorization, refreshMoxfieldDeck } from "../content/moxfieldPage";
import { deckAtom, removeAuthorTag, tagDeletionAtom } from "../state";
import { Dialog } from "./Dialog";

// Bootstrap-style buttons in Moxfield's theme colours, which reach into
// shadow roots as variables.
const button: CSSProperties = {
  padding: "0.375rem 0.75rem",
  border: "1px solid transparent",
  borderRadius: "var(--bs-border-radius, 0.375rem)",
  font: "inherit",
  cursor: "pointer",
};

const styles = {
  text: { margin: 0 },
  note: { margin: 0, fontSize: "0.85rem", opacity: 0.7 },
  error: { margin: 0, color: "rgb(var(--bs-danger-rgb, 220, 53, 69))" },
  actions: { display: "flex", justifyContent: "flex-end", gap: "0.5rem" },
  cancel: {
    ...button,
    borderColor: "var(--bs-border-color, #dee2e6)",
    background: "none",
    color: "inherit",
  },
  delete: { ...button, background: "var(--bs-danger, #dc3545)", color: "#fff" },
} satisfies Record<string, CSSProperties>;

/**
 * Asks to confirm deleting the Moxfield card tag chosen from a tag group's
 * menu (`tagDeletionAtom`), then removes it from every card in the deck. It's
 * rendered by `DeckTags`, which stays mounted while the menu doesn't.
 */
export function DeleteTagDialog({ deckId }: { deckId: string }) {
  const [tagName, setTagName] = useAtom(tagDeletionAtom);
  const deckState = useAtomValue(deckAtom);
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (tagName === null) return;
    dialog.current?.showModal();
    // Escape, the backdrop and the close button all close the dialog itself.
    const onClose = () => {
      setTagName(null);
      setError(null);
    };
    const element = dialog.current;
    element?.addEventListener("close", onClose);
    return () => element?.removeEventListener("close", onClose);
  }, [tagName, setTagName]);

  const cards =
    deckState.status === "loaded" && tagName !== null
      ? Object.entries(deckState.value.authorTags ?? {})
          .filter(([, tags]) => tags.includes(tagName))
          .map(([name]) => name)
          .sort((a, b) => a.localeCompare(b))
      : [];

  async function deleteTag(name: string) {
    setDeleting(true);
    setError(null);
    try {
      const authorization = await moxfieldAuthorization();
      if (!authorization) throw new Error("Couldn't find your Moxfield sign-in");
      await deleteCardTag(deckId, name, authorization);
      removeAuthorTag(name);
      dialog.current?.close();
      // Moxfield's page still has the old tags and version, and would save
      // them over these; if it can't be made to refetch the deck, reload it.
      if (!(await refreshMoxfieldDeck(deckId))) location.reload();
    } catch (error) {
      console.error("[moxite-refinery]", error);
      setError(error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog ref={dialog} title="Delete Moxfield tag">
      {tagName !== null && (
        <>
          <p style={styles.text}>
            Remove the tag <strong>{tagName}</strong> from{" "}
            {cards.length === 1 ? "the 1 card" : `all ${cards.length} cards`} in this deck that have
            it? Their other tags stay.
          </p>
          {cards.length > 0 && <p style={styles.note}>{cards.join(", ")}</p>}
          {error !== null && <p style={styles.error}>Couldn't delete it: {String(error)}</p>}
          <div style={styles.actions}>
            <button type="button" style={styles.cancel} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="button"
              style={{ ...styles.delete, cursor: deleting ? "progress" : "pointer" }}
              disabled={deleting}
              onClick={() => void deleteTag(tagName)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
