import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";
import type { CSSProperties } from "react";

extend([a11yPlugin]);

/** The draw tables' colour bands, from least to most likely. */
export const HEAT_BANDS = [
  { name: "Dark red", color: "#670200" },
  { name: "Red", color: "#e93e3a" },
  { name: "Red Orange", color: "#ed683c" },
  { name: "Orange", color: "#f78224" },
  { name: "Yellow Orange", color: "#ffbe1a" },
  { name: "Yellow", color: "#fff94c" },
  { name: "Yellow Green", color: "#cbf72a" },
  { name: "Lime", color: "#8bee00" },
  { name: "Green", color: "#2e9801" },
] as const;

const LIGHT_TEXT = "#fff";
const DARK_TEXT = "#000";

/** Each band's background, with whichever text colour has the higher WCAG contrast on it. */
const BAND_STYLES: CSSProperties[] = HEAT_BANDS.map(({ color }) => {
  const background = colord(color);
  const light = background.contrast(LIGHT_TEXT) >= background.contrast(DARK_TEXT);
  return { background: color, color: light ? LIGHT_TEXT : DARK_TEXT };
});

/**
 * The band colour for `fraction` (0–1), with readable text on it. `boundaries`
 * are where each band after the first starts, in percent (0–100, in order; one
 * fewer than the bands): a value at a boundary takes the higher band.
 */
export function heat(fraction: number, boundaries: readonly number[]): CSSProperties {
  const percent = fraction * 100;
  const band = boundaries.filter((boundary) => percent >= boundary).length;
  return BAND_STYLES[band];
}
