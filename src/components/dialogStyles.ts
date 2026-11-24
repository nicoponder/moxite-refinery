import type { CSSProperties } from "react";

// Bootstrap-style buttons in Moxfield's theme colours, which reach into
// shadow roots as variables.
const button: CSSProperties = {
  padding: "0.375rem 0.75rem",
  border: "1px solid transparent",
  borderRadius: "var(--bs-border-radius, 0.375rem)",
  font: "inherit",
  cursor: "pointer",
};

/** The parts of a small confirmation `Dialog`: text, a note, an error, a row of buttons. */
export const dialogStyles = {
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
  danger: { ...button, background: "var(--bs-danger, #dc3545)", color: "#fff" },
  // Moxfield's `.btn-primary` is its brand purple in both themes, unlike `--bs-primary`.
  primary: { ...button, background: "#731fa1", color: "#fff" },
} satisfies Record<string, CSSProperties>;

/**
 * Moxfield's `.form-control`, in its theme (`dark` when `body` has its
 * `darkmode` class). Its colours come from `.darkmode` rules rather than
 * theme variables, so they can't reach a shadow root.
 */
export function formControlStyle(dark: boolean): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.375rem 0.75rem",
    border: `1px solid ${dark ? "#000" : "#ced4da"}`,
    borderRadius: "var(--bs-border-radius, 0.375rem)",
    background: dark ? "#111" : "#fff",
    color: dark ? "#bbb" : "#333",
    font: "inherit",
  };
}
