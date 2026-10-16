import pmf from "@stdlib/stats-base-dists-hypergeometric-pmf";
import { useAtomValue } from "jotai";
import { useRef, useState, type CSSProperties } from "react";
import { bracketWinTurn } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import { deckAtom, settingsAtom } from "../state";
import { Dialog } from "./Dialog";
import { DrawTable, type DrawTableMode } from "./DrawTable";
import { Segmented } from "./Segmented";

const HAND_SIZE = 7;

const styles = {
  row: { display: "flex", alignItems: "center", gap: "0.4rem" },
  info: {
    flexShrink: 0,
    padding: 0,
    border: 0,
    background: "none",
    color: "inherit",
    cursor: "pointer",
    lineHeight: 0,
  },
  // Only as wide as its options, rather than stretching across the modal.
  tableMode: { alignSelf: "flex-start" },
} satisfies Record<string, CSSProperties>;

const TABLE_MODES: { value: DrawTableMode; label: string }[] = [
  { value: "exact", label: "Exact" },
  { value: "cumulative", label: "Cumulative" },
];

/** Expected number of a group's cards in an opening hand drawn from the mainboard, or NaN if the sizes don't fit. */
function expectedInHand(deckSize: number, groupSize: number): number {
  let expected = 0;
  for (let k = 1; k <= Math.min(HAND_SIZE, groupSize); k++) {
    expected += k * pmf(k, deckSize, groupSize, HAND_SIZE);
  }
  return expected;
}

/**
 * The chance (0–1) of having seen at least one of a group's cards by `turn`,
 * drawing one card a turn from turn 1 (no one skips their first draw in
 * multiplayer); turn 0 is the opening hand.
 */
function chanceToSee(deckSize: number, groupSize: number, turn: number): number {
  const seen = Math.min(HAND_SIZE + turn, deckSize);
  return 1 - pmf.factory(deckSize, groupSize, seen)(0);
}

/** The first turn up to `lastTurn` by which `chanceToSee` exceeds `threshold` (0–1), or null if none does. */
function turnToSee(
  deckSize: number,
  groupSize: number,
  threshold: number,
  lastTurn: number,
): number | null {
  for (let turn = 0; turn <= lastTurn; turn++) {
    if (chanceToSee(deckSize, groupSize, turn) > threshold) return turn;
  }
  return null;
}

/** An "i" in a circle (Lucide's "info"), like Moxfield's own outline icons. */
function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/**
 * Sits above a group of cards in the deck list and shows how many of them an
 * opening hand holds on average, and how soon one is likely to be drawn (or,
 * if not by the turn cutoff setting, how likely by then). The host carries
 * Moxfield's `small text-muted` classes, so the text inherits the same look as
 * the "% of all symbols" captions. An info button opens a modal with the same
 * lines and a table of the chances of seeing exactly, or at least, each number
 * of copies (`DrawTable`).
 */
export function GroupSummary({ target: group }: InjectionProps) {
  const deckState = useAtomValue(deckAtom);
  const { drawChanceThreshold, turnCutoffMode, fixedTurnCutoff } = useAtomValue(settingsAtom);
  const dialog = useRef<HTMLDialogElement>(null);
  const [tableMode, setTableMode] = useState<DrawTableMode>("exact");
  // `group` is the header's name and total quantity, as "Lands (35)".
  const groupSize = Number(/\((\d+)\)$/.exec(group ?? "")?.[1]);
  if (group === null || deckState.status !== "loaded") return null;

  // The library drawn from. Moxfield keeps commanders (and companions) in their
  // own boards, so a Commander deck's mainboard is its 99, not 100.
  const deckSize = deckState.value.boards.mainboard?.count ?? 0;
  const expected = expectedInHand(deckSize, groupSize);
  if (Number.isNaN(expected)) return null;
  const lastTurn =
    turnCutoffMode === "bracket" ? bracketWinTurn(deckState.value).turn : fixedTurnCutoff;
  const turn = turnToSee(deckSize, groupSize, drawChanceThreshold / 100, lastTurn);
  const percent = `${drawChanceThreshold}%`;
  // Rounded down, so a chance just short of the threshold never displays as reaching it.
  const lastTurnPercent = `${Math.floor(chanceToSee(deckSize, groupSize, lastTurn) * 100)}%`;

  const odds = (
    <div>
      <div title={`Expected number of these cards in an opening hand of ${HAND_SIZE}`}>
        {expected.toFixed(2)} expected in opening {HAND_SIZE}
      </div>
      {turn !== null ? (
        <div
          title={`First turn with over a ${percent} chance of having seen at least one of these cards, drawing one card a turn from turn 1`}
        >
          {turn === 0
            ? `>${percent} to see one in opening ${HAND_SIZE}`
            : `>${percent} to see one by turn ${turn}`}
        </div>
      ) : (
        <div
          title={`Chance of having seen at least one of these cards by turn ${lastTurn}, drawing one card a turn from turn 1; it doesn't pass ${percent} by then`}
        >
          {lastTurnPercent} chance of seeing one by turn {lastTurn}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.row}>
      {odds}
      <button
        type="button"
        title="Draw odds details"
        aria-label={`Draw odds for ${group}`}
        style={styles.info}
        onClick={() => dialog.current?.showModal()}
      >
        <InfoIcon />
      </button>
      <Dialog ref={dialog} title={group} wide>
        {odds}
        <Segmented
          options={TABLE_MODES}
          value={tableMode}
          label="Table"
          onChange={setTableMode}
          style={styles.tableMode}
        />
        <DrawTable deckSize={deckSize} groupSize={groupSize} mode={tableMode} />
      </Dialog>
    </div>
  );
}
