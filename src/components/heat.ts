import type { CSSProperties } from "react";

/** The draw tables' colour bands, from least to most likely, each dark enough for white text. */
export const HEAT_BANDS = [
  { name: "Dark red", color: "hsl(0 70% 24%)" },
  { name: "Red", color: "hsl(0 65% 34%)" },
  { name: "Orange", color: "hsl(22 75% 32%)" },
  { name: "Amber", color: "hsl(38 80% 30%)" },
  { name: "Yellow", color: "hsl(54 75% 27%)" },
  { name: "Lime", color: "hsl(80 60% 28%)" },
  { name: "Green", color: "hsl(120 55% 28%)" },
  { name: "Bright green", color: "hsl(130 65% 32%)" },
] as const;

/**
 * The band colour for `fraction` (0–1). `boundaries` are where each band after
 * the first starts, in percent (0–100, in order; one fewer than the bands):
 * a value at a boundary takes the higher band.
 */
export function heat(fraction: number, boundaries: readonly number[]): CSSProperties {
  const percent = fraction * 100;
  const band = boundaries.filter((boundary) => percent >= boundary).length;
  return { background: HEAT_BANDS[band].color, color: "#fff" };
}
