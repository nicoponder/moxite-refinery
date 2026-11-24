# Moxite Refinery

A Firefox/Chrome extension that provides statistics and deckbuilding tools on Moxfield decks.

## Install in Firefox

Download the [latest signed Firefox extension (.xpi)](https://github.com/nicoponder/moxite-refinery/releases/latest/download/moxite-refinery.xpi).

- **Desktop (140+):** If Firefox downloads the file instead of offering to install it, open
  `about:addons` → gear menu → **Install Add-on From File** and select the `.xpi`.
- **Android (142+):** Download the same `.xpi`. In Firefox, go to **Settings → About Firefox**,
  tap the Firefox logo five times, then return to **Settings → Install Extension from File**.
  [Mozilla's installation guide](https://extensionworkshop.com/documentation/publish/install-self-distributed/)
  has screenshots. Firefox on iOS does not support these extensions.

## Features

- **Draw odds by card group.** Above each group in the deck list, one row shows how many of its
  cards to expect in your opening seven, and either the first turn you're likely to have seen one
  or, if that's not by the turn cutoff, the chance of seeing one by then. Hover a figure for what
  it means. Use the group's info button for more detail, such as the difference between drawing
  exactly two lands and drawing at least two.
- **Land cycles in your colors.** The package button at the end of the lands group's row opens a
  list of land cycles (shocklands, fetchlands, triomes, surveil lands and more), each showing the
  cards that fit your deck's color identity. On a deck you can edit, add a single land, a whole
  cycle, or (for fetchlands) just those that can fetch your colors' basic land types.
- **Scryfall tags in card details.** Open a card's details (its ⋯ menu, then the card's name) to
  see oracle tags describing what it does. Click a tag to find similar cards on Scryfall, or use
  Moxfield's add-card search on a deck you can edit. Art tags are available in settings.
- **Deck-wide tag management.** Expand **Oracle Tags** below the deck list to see the tags common
  across your commanders and mainboard (on at least four card copies in a 100-card deck, fewer in
  smaller decks). On a deck you can edit, click a suggested tag to apply it to the matching cards.
  With the deck grouped by tag, a tag group's menu can **Rename Moxfield Tag** or **Delete Moxfield
  Tag** across the whole deck in one step.
- **Adjustable draw estimates.** Use the gear in the deck's bottom bar to set your target
  probability and choose a fixed turn cutoff or one based on the deck's Commander bracket.

To build the extension locally or add a feature, see the [contributing guide](CONTRIBUTING.md).

## TODO

- Setting which requires tags in order to add cards
