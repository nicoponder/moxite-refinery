import pmf from "@stdlib/stats-base-dists-hypergeometric-pmf";
import { useAtomValue } from "jotai";
import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { bracketWinTurn } from "../content/deck";
import type { InjectionProps } from "../content/injector";
import { deckAtom, settingsAtom } from "../state";
import { Dialog } from "./Dialog";
import { isLandsGroup, LandsTools } from "./LandsTools";
import { DrawTable, type DrawTableMode } from "./DrawTable";
import { Segmented } from "./Segmented";
import { Tooltip } from "./Tooltip";

const HAND_SIZE = 7;

const styles = {
  // One row however narrow the column: the figures never wrap under each other.
  row: { display: "flex", alignItems: "center", gap: "1rem", whiteSpace: "nowrap" },
  odds: { display: "flex", alignItems: "center", gap: "1rem", whiteSpace: "nowrap" },
  // The info button and, above the lands group, the lands button.
  buttons: { display: "flex", alignItems: "center", gap: "0.6rem" },
  icon: { width: "1.5em", height: "1.5em", flexShrink: 0 },
  info: {
    flexShrink: 0,
    padding: 0,
    border: 0,
    background: "none",
    // Moxfield's link colour (e.g. "Enable Tags"), in both themes.
    color: "var(--bs-primary, #731fa1)",
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

/**
 * A Lucide icon (24×24, stroked) with a number drawn over it, after Lucide's
 * "Combining icons" guide. The number knocks the icon's strokes out around
 * itself (a mask), so it stays legible on any background.
 */
function NumberedIcon({
  number,
  x,
  y,
  rotate = 0,
  size,
  children,
}: {
  number: number;
  /** The number's centre. */
  x: number;
  y: number;
  /** Degrees clockwise about its centre. */
  rotate?: number;
  /** Font sizes for one digit and for more. */
  size: [number, number];
  children: ReactNode;
}) {
  // useId's characters aren't all valid in a `url(#…)` reference.
  const mask = `numbered-icon-${useId().replace(/[^\w-]/g, "")}`;
  const label = (stroke?: string) => (
    <text
      x={x}
      y={y}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={String(number).length === 1 ? size[0] : size[1]}
      fontWeight={700}
      fill={stroke ?? "currentColor"}
      stroke={stroke ?? "none"}
      strokeWidth={stroke ? 2 : undefined}
    >
      {number}
    </text>
  );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={styles.icon}
    >
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" stroke="none" />
        {label("black")}
      </mask>
      <g mask={`url(#${mask})`}>{children}</g>
      {label()}
    </svg>
  );
}

/** A fan of cards (Lucide's "playing-cards-fan") with `number` on the front card, tilted with it. */
function CardsIcon({ number }: { number: number }) {
  return (
    <NumberedIcon number={number} x={15.6} y={14.2} rotate={23.3} size={[10, 8]}>
      <path d="M12.65 7.65a2 2 0 012.629-1.046l5.51 2.374a2 2 0 011.046 2.628l-3.957 9.184a2 2 0 01-2.628 1.046l-5.51-2.374a2 2 0 01-1.046-2.628z" />
      <path d="M18 7.777V4a2 2 0 00-2-2h-6a2 2 0 00-2 2v10a2 2 0 001.137 1.805" />
      <path d="m8 4.389-4.364.809a2 2 0 00-1.602 2.33l1.822 9.833a2 2 0 002.331 1.602l2.542-.47" />
    </NumberedIcon>
  );
}

/** A stopwatch (Lucide's "timer") with `number` on its face in place of its hand. */
function TimerIcon({ number }: { number: number }) {
  return (
    <NumberedIcon number={number} x={12} y={14.3} size={[12, 9.5]}>
      <line x1="10" x2="14" y1="2" y2="2" />
      <circle cx="12" cy="14" r="8" />
    </NumberedIcon>
  );
}

/** A bell curve (Lucide's "chart-bell-curve") with `number` under its peak. */
function BellCurveIcon({ number }: { number: number }) {
  return (
    <NumberedIcon number={number} x={13} y={16.5} size={[9, 7]}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 16c3.5 0 2.5-10 6-10s2.5 10 6 10" />
    </NumberedIcon>
  );
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
 * Sits above a group of cards in the deck list and shows, in one row, how many
 * of them an opening hand holds on average (a fan of cards with a 7), and how
 * soon one is likely to be drawn (the threshold chance and a bell curve with
 * the turn) or, if not by the turn cutoff setting, how likely by then (a timer
 * with the cutoff); each figure's meaning in words is in its tooltip. The host
 * carries Moxfield's `small text-muted` classes, so the text inherits the same
 * look as the "% of all symbols" captions. An info button (in Moxfield's link
 * colour) opens a modal with the same figures and a table of the chances of
 * seeing exactly, or at least, each number of copies (`DrawTable`). Above the
 * lands group, `LandsTools`' button follows it.
 */
export function GroupSummary({ deckId, target: group }: InjectionProps) {
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

  // Each figure is followed by an icon for what it's of, and the words it
  // replaces are in its tooltip.
  const odds = (
    <div style={styles.odds}>
      <Tooltip text={`${expected.toFixed(2)} expected in opening ${HAND_SIZE}`}>
        {expected.toFixed(2)}
        <CardsIcon number={HAND_SIZE} />
      </Tooltip>
      {turn !== null ? (
        <Tooltip
          text={
            turn === 0
              ? `>${percent} to see one in opening ${HAND_SIZE}`
              : `>${percent} to see one by turn ${turn}`
          }
        >
          {`>${percent}`}
          <BellCurveIcon number={turn} />
        </Tooltip>
      ) : (
        <Tooltip text={`${lastTurnPercent} chance of seeing one by turn ${lastTurn}`}>
          {lastTurnPercent}
          <TimerIcon number={lastTurn} />
        </Tooltip>
      )}
    </div>
  );

  return (
    <div style={styles.row}>
      {odds}
      <div style={styles.buttons}>
        <Tooltip text="Draw odds details">
          <button
            type="button"
            aria-label={`Draw odds for ${group}`}
            style={styles.info}
            onClick={() => dialog.current?.showModal()}
          >
            <InfoIcon />
          </button>
        </Tooltip>
        {isLandsGroup(group) && <LandsTools deckId={deckId} target={group} />}
      </div>
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
