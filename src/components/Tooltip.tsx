import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";

// Moxfield's own tooltips (`.browser-tooltip[data-tooltip]`) are an `::after`
// over the element, which an ancestor's `overflow` can clip. This one is a
// manual popover instead, in the browser's top layer (so it also shows above an
// open modal), placed from the trigger's position with the same look: 4px above
// it and centred, nearly opaque black, `--bs-tooltip-color` text (#ddd in dark
// mode), 0.875rem, fading in and out over 0.15s. It still inherits from where
// it's injected, so it resets what it doesn't set.
const GAP = 4;
/** The least distance from the viewport's edges. */
const MARGIN = 4;

const styles = {
  trigger: { display: "inline-flex", alignItems: "center", gap: "0.2em" },
  tooltip: {
    position: "fixed",
    inset: "auto",
    margin: 0,
    width: "max-content",
    maxWidth: 250,
    padding: "0.25rem 0.5rem",
    border: 0,
    borderRadius: "var(--bs-border-radius, 0.375rem)",
    background: "#000",
    color: "var(--bs-tooltip-color, #fff)",
    fontFamily: "var(--bs-body-font-family, system-ui, sans-serif)",
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.5,
    textAlign: "center",
    whiteSpace: "normal",
    pointerEvents: "none",
    overflow: "visible",
  },
} satisfies Record<string, CSSProperties>;

// Opacity, its transition and the popover's own states can only be styled from a stylesheet.
const stylesheet = `
.tooltip { opacity: 0; transition: opacity 0.15s ease-in-out, display 0.15s allow-discrete, overlay 0.15s allow-discrete; }
.tooltip:popover-open { opacity: 0.9; }
@starting-style { .tooltip:popover-open { opacity: 0; } }
`;

/** Puts `tip` above `trigger` and centred on it, or below it if there's no room above, within the viewport. */
function place(trigger: HTMLElement, tip: HTMLElement) {
  const anchor = trigger.getBoundingClientRect();
  const { width, height } = tip.getBoundingClientRect();
  const above = anchor.top - GAP - height;
  const top = above >= MARGIN ? above : anchor.bottom + GAP;
  const centred = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.max(MARGIN, Math.min(centred, window.innerWidth - width - MARGIN));
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

interface TooltipProps {
  /** Shown on hover or focus within, and as the children's accessible description. */
  text: string;
  children: ReactNode;
}

/** Wraps its children in an inline box that shows `text` in a tooltip styled like Moxfield's own. */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);

  // Stable, so the scroll listener can be removed by a later render or on unmount.
  const { show, hide } = useMemo(() => {
    const hide = () => {
      window.removeEventListener("scroll", hide, true);
      if (tip.current?.matches(":popover-open")) tip.current.hidePopover();
    };
    const show = () => {
      if (!trigger.current || !tip.current) return;
      if (!tip.current.matches(":popover-open")) tip.current.showPopover();
      place(trigger.current, tip.current);
      // It's placed once, so it goes rather than drifting from its trigger.
      window.addEventListener("scroll", hide, true);
    };
    return { show, hide };
  }, []);
  useEffect(() => hide, [hide]);

  return (
    <span
      ref={trigger}
      aria-describedby={id}
      style={styles.trigger}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <style>{stylesheet}</style>
      <div
        ref={tip}
        id={id}
        popover="manual"
        role="tooltip"
        className="tooltip"
        style={styles.tooltip}
      >
        {text}
      </div>
    </span>
  );
}
