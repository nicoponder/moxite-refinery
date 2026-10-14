import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { HEAT_BANDS } from "./heat";

const STEP = 0.5;
const BIG_STEP = 5;

const styles = {
  // Room above and below the track for the thumbs, which stand taller than it.
  slider: { position: "relative", padding: "0.3rem 0", touchAction: "none", cursor: "pointer", userSelect: "none" },
  track: { position: "relative", height: "1.25rem", borderRadius: "var(--bs-border-radius, 0.375rem)", overflow: "hidden" },
  segment: { position: "absolute", top: 0, bottom: 0 },
  thumb: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "0.6rem",
    padding: 0,
    transform: "translateX(-50%)",
    border: "1px solid rgb(0 0 0 / 0.6)",
    borderRadius: "0.2rem",
    background: "#fff",
    cursor: "grab",
  },
  legend: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.25rem 0.75rem", margin: "0.4rem 0 0", padding: 0, listStyle: "none" },
  legendItem: { display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  swatch: { flexShrink: 0, width: "0.7rem", height: "0.7rem", borderRadius: "0.15rem" },
} satisfies Record<string, CSSProperties>;

// Thumbs show focus with a ring, which inline styles can't express.
const stylesheet = "[data-band-thumb]:focus-visible { outline: 2px solid var(--bs-primary, #731fa1); outline-offset: 2px; }";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function format(percent: number): string {
  return `${percent}%`;
}

interface Drag {
  pointerId: number;
  /** The thumb being dragged, or several when they share a value until the drag's direction picks one. */
  thumbs: number[];
  startX: number;
  boundaries: number[];
}

interface BandSliderProps {
  /** Where each band after the first starts, in percent (one fewer than `HEAT_BANDS`). */
  value: readonly number[];
  onChange: (value: number[]) => void;
  /** Names the slider, e.g. "Exact tables". */
  label: string;
}

/**
 * Sets where each of the draw tables' colour bands starts: a track showing the
 * bands at their widths, with a thumb on each boundary that can't pass its
 * neighbours, so the bands stay in order. Drag a thumb, or press the track to
 * grab the nearest one; thumbs also take arrow keys (Shift for bigger steps)
 * and Home/End. Changes are passed on when a drag ends, not as it moves.
 */
export function BandSlider({ value, onChange, label }: BandSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const boundaries = drag?.boundaries ?? [...value];
  const edges = [0, ...boundaries, 100];

  /** Moves thumb `i` towards `target`, within its neighbours and on the step. */
  function moved(current: number[], i: number, target: number): number[] {
    const min = i === 0 ? 0 : current[i - 1];
    const max = i === current.length - 1 ? 100 : current[i + 1];
    const next = [...current];
    next[i] = clamp(Math.round(target / STEP) * STEP, min, max);
    return next;
  }

  function percentAt(clientX: number): number {
    const rect = trackRef.current!.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = percentAt(event.clientX);
    const distances = boundaries.map((boundary) => Math.abs(boundary - target));
    const nearest = Math.min(...distances);
    const thumbs = distances.flatMap((distance, i) => (distance === nearest ? [i] : []));
    event.currentTarget.setPointerCapture(event.pointerId);
    thumbRefs.current[thumbs[0]]?.focus();
    // A single nearest thumb jumps to the pointer; tied ones wait to see which way the drag goes.
    setDrag({ pointerId: event.pointerId, thumbs, startX: event.clientX, boundaries: thumbs.length === 1 ? moved(boundaries, thumbs[0], target) : boundaries });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    let thumbs = drag.thumbs;
    if (thumbs.length > 1) {
      if (event.clientX === drag.startX) return;
      // Moving left can only separate the lowest of the tied thumbs, right the highest.
      thumbs = [event.clientX < drag.startX ? thumbs[0] : thumbs[thumbs.length - 1]];
      thumbRefs.current[thumbs[0]]?.focus();
    }
    setDrag({ ...drag, thumbs, boundaries: moved(drag.boundaries, thumbs[0], percentAt(event.clientX)) });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.boundaries.some((boundary, i) => boundary !== value[i])) onChange(drag.boundaries);
    setDrag(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const targets: Record<string, number> = {
      ArrowLeft: value[i] - step,
      ArrowDown: value[i] - step,
      ArrowRight: value[i] + step,
      ArrowUp: value[i] + step,
      Home: -Infinity,
      End: Infinity,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = moved([...value], i, targets[event.key]);
    if (next[i] !== value[i]) onChange(next);
  }

  return (
    <div>
      <style>{stylesheet}</style>
      <div
        style={styles.slider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={trackRef} style={styles.track}>
          {HEAT_BANDS.map((band, b) => (
            <div key={band.name} style={{ ...styles.segment, left: `${edges[b]}%`, width: `${edges[b + 1] - edges[b]}%`, background: band.color }} />
          ))}
        </div>
        {boundaries.map((boundary, i) => (
          <button
            key={i}
            ref={(element) => {
              thumbRefs.current[i] = element;
            }}
            type="button"
            role="slider"
            data-band-thumb=""
            aria-label={`${label}: where ${HEAT_BANDS[i + 1].name.toLowerCase()} starts`}
            aria-valuemin={i === 0 ? 0 : boundaries[i - 1]}
            aria-valuemax={i === boundaries.length - 1 ? 100 : boundaries[i + 1]}
            aria-valuenow={boundary}
            aria-valuetext={format(boundary)}
            title={`${HEAT_BANDS[i + 1].name} from ${format(boundary)}`}
            style={{ ...styles.thumb, left: `${boundary}%`, cursor: drag ? "grabbing" : "grab" }}
            onKeyDown={(event) => onKeyDown(event, i)}
          />
        ))}
      </div>
      <ul style={styles.legend} aria-label={`${label} colour ranges`}>
        {HEAT_BANDS.map((band, b) => (
          <li key={band.name} style={{ ...styles.legendItem, opacity: edges[b + 1] > edges[b] ? 1 : 0.4 }} title={band.name}>
            <span style={{ ...styles.swatch, background: band.color }} />
            {edges[b + 1] > edges[b] ? `${edges[b]}–${edges[b + 1]}%` : "unused"}
          </li>
        ))}
      </ul>
    </div>
  );
}
