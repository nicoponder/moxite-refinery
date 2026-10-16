import type { CSSProperties } from "react";

const styles = {
  segments: {
    display: "flex",
    border: "1px solid var(--bs-border-color, #dee2e6)",
    borderRadius: "var(--bs-border-radius, 0.375rem)",
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    padding: "0.4rem 0.75rem",
    border: 0,
    background: "none",
    color: "inherit",
    font: "inherit",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  segmentSelected: {
    background: "var(--bs-primary, #731fa1)",
    color: "var(--bs-modal-bg, #fff)",
    fontWeight: 600,
  },
} satisfies Record<string, CSSProperties>;

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** The id of the element naming the choice. */
  labelledBy?: string;
  /** Names the choice when no element on the page does. */
  label?: string;
  /** Overrides for the container, e.g. to size it. */
  style?: CSSProperties;
}

/** A row of buttons choosing one of a few options, in Moxfield's colours. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  label,
  style,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      style={{ ...styles.segments, ...style }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          style={{ ...styles.segment, ...(value === option.value ? styles.segmentSelected : {}) }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
