import { useId, type CSSProperties, type ReactNode, type Ref, type RefObject } from "react";

// The dialog opens with `showModal()`, which puts it in the browser's top
// layer, above Moxfield's own stacking contexts (e.g. the bottom bar). It
// still inherits from wherever it's injected, so it resets alignment, colours
// and font, taking theme colours from the Bootstrap variables Moxfield sets
// for its own modals, which reach into shadow roots.
const styles = {
  dialog: {
    width: "min(28rem, calc(100vw - 2rem))",
    // Top-aligned rather than centred, so it doesn't jump as its content changes length.
    marginTop: "15vh",
    // Below the top margin, so it scrolls rather than running off the screen.
    maxHeight: "calc(85vh - 1rem)",
    padding: 0,
    border: "1px solid var(--bs-border-color, #dee2e6)",
    borderRadius: "var(--bs-border-radius-lg, 0.5rem)",
    background: "var(--bs-modal-bg, #fff)",
    color: "var(--bs-body-color, #212529)",
    fontFamily: "var(--bs-body-font-family, system-ui, sans-serif)",
    fontSize: "1rem",
    fontWeight: 400,
    lineHeight: 1.5,
    textAlign: "left",
    whiteSpace: "normal",
  },
  wide: { width: "max-content", maxWidth: "calc(100vw - 2rem)" },
  body: { display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.25rem 1.5rem 1.5rem" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 600 },
  close: { padding: "0 0.25rem", border: 0, background: "none", color: "inherit", fontSize: "1.5rem", lineHeight: 1, cursor: "pointer", opacity: 0.7 },
} satisfies Record<string, CSSProperties>;

// The dialog's backdrop can only be styled from a stylesheet.
const stylesheet = "dialog::backdrop { background: rgb(0 0 0 / 0.5); }";

interface DialogProps {
  /** Open it with `ref.current.showModal()`. */
  ref: RefObject<HTMLDialogElement | null>;
  title: ReactNode;
  /**
   * As wide as its content, within the viewport, rather than a narrow form's
   * 28rem; content wider than the viewport should scroll itself.
   */
  wide?: boolean;
  children: ReactNode;
}

/** A modal with a title and a close button, styled like Moxfield's own; closes on Escape or a click on its backdrop. */
export function Dialog({ ref, title, wide, children }: DialogProps) {
  const titleId = useId();
  return (
    <>
      <style>{stylesheet}</style>
      <dialog
        ref={ref as Ref<HTMLDialogElement>}
        aria-labelledby={titleId}
        style={wide ? { ...styles.dialog, ...styles.wide } : styles.dialog}
        // The body fills the dialog, so a click on the dialog itself is on its backdrop.
        onClick={(event) => event.target === event.currentTarget && ref.current?.close()}
      >
        <div style={styles.body}>
          <div style={styles.header}>
            <h2 id={titleId} style={styles.title}>
              {title}
            </h2>
            <button type="button" aria-label="Close" style={styles.close} onClick={() => ref.current?.close()}>
              ×
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
