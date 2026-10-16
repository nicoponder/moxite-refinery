import { useAtomValue } from "jotai";
import { useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { bracketWinTurn } from "../content/deck";
import {
  DEFAULT_HEAT_BANDS,
  deckAtom,
  settingsAtom,
  updateSettings,
  type Settings as SettingsValues,
} from "../state";
import { BandSlider } from "./BandSlider";
import { Dialog } from "./Dialog";
import { Segmented } from "./Segmented";

const styles = {
  button: {
    marginLeft: "1.5rem",
    padding: 0,
    border: 0,
    background: "none",
    color: "inherit",
    cursor: "pointer",
    verticalAlign: "middle",
    lineHeight: 0,
  },
  label: { display: "block", marginBottom: "0.4rem", fontWeight: 600 },
  hint: { margin: "0.35rem 0 0", fontSize: "0.85rem", opacity: 0.7 },
  checkbox: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" },
  checkboxInput: {
    width: "1rem",
    height: "1rem",
    margin: 0,
    accentColor: "var(--bs-primary, #731fa1)",
    cursor: "pointer",
  },
  numberField: { display: "flex", alignItems: "center", gap: "0.4rem" },
  options: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  sliderHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    fontSize: "0.9rem",
  },
  reset: {
    padding: 0,
    border: 0,
    background: "none",
    color: "var(--bs-link-color, #731fa1)",
    font: "inherit",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  sliders: { display: "flex", flexDirection: "column", gap: "0.9rem" },
  numberInput: {
    width: "4.5rem",
    padding: "0.3rem 0.5rem",
    border: "1px solid var(--bs-border-color, #dee2e6)",
    borderRadius: "var(--bs-border-radius, 0.375rem)",
    background: "var(--bs-body-bg, #fff)",
    color: "inherit",
    font: "inherit",
  },
} satisfies Record<string, CSSProperties>;

/** A gear outline in the style of Moxfield's own icons (Lucide's "settings"). */
function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const HEAT_BAND_SLIDERS = [
  { key: "exactHeatBands", label: "Exact tables" },
  { key: "cumulativeHeatBands", label: "Cumulative tables" },
] as const;

const TAG_SEARCH_OPTIONS: { value: SettingsValues["tagSearch"]; label: string }[] = [
  { value: "scryfall", label: "Scryfall search" },
  { value: "moxfield", label: "Add-card search" },
];

interface NumberSettingInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  value: number;
  min: number;
  max: number;
  /** Called with each valid value typed: a whole number from `min` to `max`. */
  onChange: (value: number) => void;
}

/**
 * A whole-number setting. Keeps its own draft so that in-between values (an
 * empty field, a stray digit) can be typed; only valid ones are passed on, and
 * leaving the field restores the saved value.
 */
function NumberSettingInput({
  value,
  min,
  max,
  onChange,
  onBlur,
  ...props
}: NumberSettingInputProps) {
  const [draft, setDraft] = useState(String(value));
  // Follows changes saved elsewhere (another tab).
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      style={styles.numberInput}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (event.target.value !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max)
          onChange(parsed);
      }}
      onBlur={(event) => {
        setDraft(String(value));
        onBlur?.(event);
      }}
    />
  );
}

/** Describes the bracket turn cutoff for the open deck. */
function BracketCutoffHint() {
  const deckState = useAtomValue(deckAtom);
  if (deckState.status !== "loaded") return null;
  const { bracket, turn } = bracketWinTurn(deckState.value);
  return (
    <>
      {" "}
      This deck:{" "}
      {bracket === null ? `no bracket, so turn ${turn}` : `bracket ${bracket}, so turn ${turn}`}.
    </>
  );
}

/** A gear button in the deck page's bottom bar that opens the extension's settings. */
export function Settings() {
  const {
    tagSearch,
    showArtTags,
    drawChanceThreshold,
    turnCutoffMode,
    fixedTurnCutoff,
    drawTableFromOpeningHand,
    drawTableMaxCardsSeen,
    drawTableMaxCopies,
    exactHeatBands,
    cumulativeHeatBands,
  } = useAtomValue(settingsAtom);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        title="Moxite Refinery settings"
        aria-label="Moxite Refinery settings"
        style={styles.button}
        onClick={() => dialog.current?.showModal()}
      >
        <GearIcon />
      </button>
      <Dialog ref={dialog} title="Moxite Refinery settings">
        <div>
          <span id="moxite-tag-search-label" style={styles.label}>
            Clicking a Scryfall tag opens
          </span>
          <Segmented
            options={TAG_SEARCH_OPTIONS}
            value={tagSearch}
            labelledBy="moxite-tag-search-label"
            onChange={(value) => updateSettings({ tagSearch: value })}
          />
          <p style={styles.hint}>
            {tagSearch === "scryfall"
              ? "Opens the tag's search on scryfall.com in a new tab."
              : "Opens the tag's search in this deck's add-card search. Decks you can't edit don't have one, so their tags open Scryfall instead."}
          </p>
        </div>

        <div>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={showArtTags}
              style={styles.checkboxInput}
              onChange={(event) => updateSettings({ showArtTags: event.target.checked })}
            />
            Show art tags
          </label>
          <p style={styles.hint}>
            Art tags describe what a card's illustration shows. They're only downloaded while this
            is on (about 13 MB, refreshed daily).
          </p>
        </div>

        <div>
          <label htmlFor="moxite-draw-chance-threshold" style={styles.label}>
            Draw chance threshold
          </label>
          <div style={styles.numberField}>
            <NumberSettingInput
              id="moxite-draw-chance-threshold"
              value={drawChanceThreshold}
              min={1}
              max={99}
              onChange={(value) => updateSettings({ drawChanceThreshold: value })}
            />
            %
          </div>
          <p style={styles.hint}>
            Each card group in the deck list shows the first turn with over this chance of having
            drawn at least one of its cards. Between 1 and 99%.
          </p>
        </div>

        <div>
          <span id="moxite-turn-cutoff-label" style={styles.label}>
            Turn cutoff
          </span>
          <div role="radiogroup" aria-labelledby="moxite-turn-cutoff-label" style={styles.options}>
            <label style={styles.checkbox}>
              <input
                type="radio"
                name="moxite-turn-cutoff"
                checked={turnCutoffMode === "bracket"}
                style={styles.checkboxInput}
                onChange={() => updateSettings({ turnCutoffMode: "bracket" })}
              />
              From the deck's bracket
            </label>
            <div style={styles.numberField}>
              <label style={styles.checkbox}>
                <input
                  type="radio"
                  name="moxite-turn-cutoff"
                  checked={turnCutoffMode === "fixed"}
                  style={styles.checkboxInput}
                  onChange={() => updateSettings({ turnCutoffMode: "fixed" })}
                />
                Turn
              </label>
              <NumberSettingInput
                aria-label="Turn cutoff"
                value={fixedTurnCutoff}
                min={1}
                max={99}
                // Typing a turn picks this option.
                onFocus={() => updateSettings({ turnCutoffMode: "fixed" })}
                onChange={(value) => updateSettings({ fixedTurnCutoff: value })}
              />
            </div>
          </div>
          <p style={styles.hint}>
            Groups that don't pass the threshold by this turn show their chance of being drawn by it
            instead.
            {turnCutoffMode === "bracket" && (
              <>
                {" "}
                The deck's bracket gives the first turn someone can be expected to win: turn 9 in
                bracket 1, 8 in bracket 2, 6 in bracket 3, and 4 in brackets 4 and 5 or without a
                bracket.
                <BracketCutoffHint />
              </>
            )}
          </p>
        </div>

        <div>
          <span style={styles.label}>Draw tables</span>
          <div style={styles.options}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={drawTableFromOpeningHand}
                style={styles.checkboxInput}
                onChange={(event) =>
                  updateSettings({ drawTableFromOpeningHand: event.target.checked })
                }
              />
              Start at the opening hand (7 cards seen)
            </label>
            <label style={styles.numberField}>
              Cards seen up to
              <NumberSettingInput
                value={drawTableMaxCardsSeen}
                min={7}
                max={99}
                onChange={(value) => updateSettings({ drawTableMaxCardsSeen: value })}
              />
            </label>
            <label style={styles.numberField}>
              Copies up to
              <NumberSettingInput
                value={drawTableMaxCopies}
                min={1}
                max={99}
                onChange={(value) => updateSettings({ drawTableMaxCopies: value })}
              />
            </label>
          </div>
          <p style={styles.hint}>
            The tables in a card group's info modal. Cards seen (7 to 99) stop at the mainboard's
            size, and copies (1 to 99) at the group's size.
          </p>
        </div>

        <div>
          <span style={styles.label}>Table colours</span>
          <div style={styles.sliders}>
            {HEAT_BAND_SLIDERS.map(({ key, label }) => {
              const value = key === "exactHeatBands" ? exactHeatBands : cumulativeHeatBands;
              const isDefault = value.every((boundary, i) => boundary === DEFAULT_HEAT_BANDS[i]);
              return (
                <div key={key}>
                  <div style={styles.sliderHeader}>
                    {label}
                    <button
                      type="button"
                      style={{ ...styles.reset, visibility: isDefault ? "hidden" : "visible" }}
                      onClick={() => updateSettings({ [key]: [...DEFAULT_HEAT_BANDS] })}
                    >
                      Reset
                    </button>
                  </div>
                  <BandSlider
                    label={label}
                    value={value}
                    onChange={(bands) => updateSettings({ [key]: bands })}
                  />
                </div>
              );
            })}
          </div>
          <p style={styles.hint}>
            Where each colour starts. In exact tables, a cell's share of its column's most likely
            outcome; in cumulative tables, which run much higher, the chance itself. Drag a handle
            or use the arrow keys (Shift for steps of 5).
          </p>
        </div>
      </Dialog>
    </>
  );
}
