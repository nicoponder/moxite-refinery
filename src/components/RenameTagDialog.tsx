import { useAtom, useAtomValue } from "jotai";
import { useEffect, useId, useRef, useState } from "react";
import { invalidTagName, renameCardTag, tagKey } from "../content/deck";
import { moxfieldAuthorization, refreshMoxfieldDeck } from "../content/moxfieldPage";
import { deckAtom, renameAuthorTag, tagRenameAtom } from "../state";
import { Dialog } from "./Dialog";
import { dialogStyles as styles, formControlStyle } from "./dialogStyles";

/**
 * Asks for a new name for the Moxfield card tag chosen from a tag group's menu
 * (`tagRenameAtom`), then renames it on every card in the deck. It's rendered
 * by `DeckTags`, which stays mounted while the menu doesn't.
 */
export function RenameTagDialog({ deckId }: { deckId: string }) {
  const [tagName, setTagName] = useAtom(tagRenameAtom);
  const deckState = useAtomValue(deckAtom);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The name starts as the tag's own, set as it's chosen rather than in the
  // effect below, so the input has it by the time that selects it.
  const [chosen, setChosen] = useState<string | null>(null);
  if (tagName !== chosen) {
    setChosen(tagName);
    setNewName(tagName ?? "");
  }

  useEffect(() => {
    if (tagName === null) return;
    dialog.current?.showModal();
    // Focused with its name selected, ready to be typed over.
    input.current?.select();
    // Escape, the backdrop and the close button all close the dialog itself.
    const onClose = () => {
      setTagName(null);
      setError(null);
    };
    const element = dialog.current;
    element?.addEventListener("close", onClose);
    return () => element?.removeEventListener("close", onClose);
  }, [tagName, setTagName]);

  const authorTags = deckState.status === "loaded" ? (deckState.value.authorTags ?? {}) : {};
  const cards =
    tagName === null
      ? 0
      : Object.values(authorTags).filter((tags) => tags.includes(tagName)).length;
  const name = newName.trim();
  const invalid = invalidTagName(name);
  // Another of the deck's tags the new name would merge this one into.
  const existing =
    tagName === null || invalid
      ? undefined
      : [...new Set(Object.values(authorTags).flat())].find(
          (tag) => tag !== tagName && tagKey(tag) === tagKey(name),
        );

  async function rename(from: string, to: string) {
    setRenaming(true);
    setError(null);
    try {
      const authorization = await moxfieldAuthorization();
      if (!authorization) throw new Error("Couldn't find your Moxfield sign-in");
      await renameCardTag(deckId, from, to, authorization);
      renameAuthorTag(from, to);
      dialog.current?.close();
      // Moxfield's page still has the old tags and version, and would save
      // them over these; if it can't be made to refetch the deck, reload it.
      if (!(await refreshMoxfieldDeck(deckId))) location.reload();
    } catch (error) {
      console.error("[moxite-refinery]", error);
      setError(error);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Dialog ref={dialog} title="Rename Moxfield tag">
      {tagName !== null && (
        <form
          style={{ display: "contents" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid && name !== tagName && !renaming) void rename(tagName, name);
          }}
        >
          <label htmlFor={inputId} style={styles.text}>
            Rename the tag <strong>{tagName}</strong> on{" "}
            {cards === 1 ? "the 1 card" : `all ${cards} cards`} in this deck that have it to:
          </label>
          <input
            ref={input}
            id={inputId}
            type="text"
            value={newName}
            autoComplete="off"
            spellCheck={false}
            style={formControlStyle(document.body.classList.contains("darkmode"))}
            onChange={(event) => setNewName(event.target.value)}
          />
          {newName && invalid && <p style={styles.error}>{invalid}</p>}
          {existing !== undefined && (
            <p style={styles.note}>
              This deck already has the tag <strong>{existing}</strong>; cards with both will keep
              just that one.
            </p>
          )}
          {error !== null && <p style={styles.error}>Couldn't rename it: {String(error)}</p>}
          <div style={styles.actions}>
            <button type="button" style={styles.cancel} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.primary,
                cursor: renaming ? "progress" : "pointer",
                opacity: invalid || name === tagName ? 0.65 : 1,
              }}
              disabled={renaming || invalid !== null || name === tagName}
            >
              {renaming ? "Renaming…" : "Rename"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
