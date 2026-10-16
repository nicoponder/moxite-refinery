import pmf from "@stdlib/stats-base-dists-hypergeometric-pmf";
import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import { settingsAtom } from "../state";
import { heat } from "./heat";

const HAND_SIZE = 7;

// The modal's background, for sticky headers that cards scroll under.
const HEADER_BACKGROUND = "var(--bs-modal-bg, #fff)";

const styles = {
  scroller: { overflow: "auto", maxHeight: "calc(85vh - 14rem)" },
  table: {
    borderCollapse: "separate",
    borderSpacing: 1,
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  columnHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    padding: "0.15rem 0.4rem",
    textAlign: "right",
    background: HEADER_BACKGROUND,
  },
  rowHeader: {
    position: "sticky",
    left: 0,
    zIndex: 1,
    padding: "0.15rem 0.4rem",
    textAlign: "right",
    background: HEADER_BACKGROUND,
  },
  corner: { position: "sticky", top: 0, left: 0, zIndex: 2, background: HEADER_BACKGROUND },
  axisLabel: { padding: "0.15rem 0.4rem", textAlign: "left", fontWeight: 400, opacity: 0.7 },
  cell: { padding: "0.15rem 0.4rem", textAlign: "right", fontWeight: 600 },
  // The expected-count row, which stays in view below the scrolling rows.
  footerCell: {
    position: "sticky",
    bottom: 0,
    zIndex: 1,
    padding: "0.3rem 0.4rem 0.15rem",
    textAlign: "right",
    background: HEADER_BACKGROUND,
  },
  footerHeader: { left: 0, zIndex: 2, fontWeight: 400, lineHeight: 1.2, opacity: 0.7 },
} satisfies Record<string, CSSProperties>;

// Chances below this round to 0.00%: shown as "<0.01%", on no colour.
const NEGLIGIBLE = 0.00005;

/**
 * A chance as a percentage to two decimals, except that certainties show as
 * "100%", and chances that would round to 0.00% or 100.00% without being
 * either show as "<0.01%" or ">99.99%". (Impossible outcomes aren't shown.)
 */
function formatChance(p: number): string {
  if (p >= 1) return "100%";
  if (p < NEGLIGIBLE) return "<0.01%";
  if (p >= 0.99995) return ">99.99%";
  return `${(p * 100).toFixed(2)}%`;
}

export type DrawTableMode = "exact" | "cumulative";

interface DrawTableProps {
  deckSize: number;
  groupSize: number;
  mode: DrawTableMode;
}

/**
 * For each number of cards seen (columns) and each number of the group's
 * copies (rows), the chance of having seen exactly that many copies ("exact"),
 * or at least that many ("cumulative"). Columns run from 1, or 7 (the opening
 * hand), up to a maximum; rows from 0 up to a maximum, both from the settings
 * and within the mainboard's and the group's sizes. Exact columns are each
 * coloured on their own scale, as a share of their most likely outcome (shown
 * or not); cumulative ones by the chance itself. Each mode has its own colour
 * band boundaries in the settings. A last row gives each column's expected
 * number of copies.
 */
export function DrawTable({ deckSize, groupSize, mode }: DrawTableProps) {
  const {
    drawTableFromOpeningHand,
    drawTableMaxCardsSeen,
    drawTableMaxCopies,
    exactHeatBands,
    cumulativeHeatBands,
  } = useAtomValue(settingsAtom);
  const firstCardsSeen = drawTableFromOpeningHand ? HAND_SIZE : 1;
  const lastCardsSeen = Math.min(drawTableMaxCardsSeen, deckSize);
  const cardsSeen = Array.from(
    { length: Math.max(lastCardsSeen - firstCardsSeen + 1, 0) },
    (_, i) => firstCardsSeen + i,
  );
  // Every possible number of copies, to calculate with; only those up to the maximum are shown.
  const copies = Array.from({ length: groupSize + 1 }, (_, k) => k);
  const shownCopies = copies.slice(0, Math.min(drawTableMaxCopies, groupSize) + 1);
  // exact[i][k]: the chance of exactly k copies among the first cardsSeen[i] cards.
  const exact = cardsSeen.map((n) => {
    const column = pmf.factory(deckSize, groupSize, n);
    return copies.map((k) => column(k));
  });
  // cumulative[i][k]: the chance of at least k, summing exact chances from
  // the most copies down, which keeps small chances accurate. It's a certainty
  // (exactly 1, which the sum can miss by floating-point error) when fewer
  // than k copies is impossible, e.g. always for k = 0.
  const cumulative = exact.map((column) => {
    const atLeast: number[] = [];
    let sum = 0;
    for (let k = column.length - 1; k >= 0; k--) {
      sum += column[k];
      atLeast[k] = column.slice(0, k).every((p) => p === 0) ? 1 : Math.min(sum, 1);
    }
    return atLeast;
  });
  const columnMaxes = exact.map((column) => Math.max(...column));
  // The expected number of copies among the first cardsSeen[i] cards: Σ k × P(exactly k).
  const expected = exact.map((column) => column.reduce((sum, p, k) => sum + k * p, 0));

  function cell(n: number, i: number, k: number) {
    if (mode === "cumulative") {
      // At least k of the first n is impossible past k = n; left blank.
      if (k > n) return <td key={n} />;
      const p = cumulative[i][k];
      return (
        <td
          key={n}
          title={`At least ${k} of ${groupSize} in the first ${n} cards seen`}
          style={{ ...styles.cell, ...(p < NEGLIGIBLE ? {} : heat(p, cumulativeHeatBands)) }}
        >
          {formatChance(p)}
        </td>
      );
    }
    const p = exact[i][k];
    // Impossible outcomes, e.g. more copies than cards seen, are left blank.
    if (p === 0) return <td key={n} />;
    return (
      <td
        key={n}
        title={`Exactly ${k} of ${groupSize} in the first ${n} cards seen`}
        style={{
          ...styles.cell,
          ...(p < NEGLIGIBLE ? {} : heat(p / columnMaxes[i], exactHeatBands)),
        }}
      >
        {formatChance(p)}
      </td>
    );
  }

  return (
    <div style={styles.scroller}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.corner, ...styles.axisLabel }}>Copies ↓</th>
            {cardsSeen.map((n) => (
              <th key={n} scope="col" style={styles.columnHeader}>
                {n}
              </th>
            ))}
            <th style={{ ...styles.columnHeader, ...styles.axisLabel }}>← Cards seen</th>
          </tr>
        </thead>
        <tbody>
          {shownCopies.map((k) => (
            <tr key={k}>
              <th scope="row" style={styles.rowHeader}>
                {k}
              </th>
              {cardsSeen.map((n, i) => cell(n, i, k))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" style={{ ...styles.footerCell, ...styles.footerHeader }}>
              Expected #
              <br />
              by this draw
            </th>
            {cardsSeen.map((n, i) => (
              <td
                key={n}
                title={`Expected number of these ${groupSize} cards in the first ${n} cards seen`}
                style={styles.footerCell}
              >
                {expected[i].toFixed(2)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
