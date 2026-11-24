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

- **Draw odds by card group.** See how many lands to expect in your opening seven, or how likely
  you are to see a ramp card by a given turn. Use a group's info button for more detail, such as
  the difference between drawing exactly two lands and drawing at least two.
- **Scryfall tags in card details.** Open a card's **View Details** panel to see oracle tags
  describing what it does. Click a tag to find similar cards on Scryfall, or use Moxfield's
  add-card search on a deck you can edit. Art tags are available in settings.
- **Deck-wide tag management.** Expand **Oracle Tags** below the deck list to see tags shared by
  at least three card copies across your commanders and mainboard. On a deck you can edit, click
  a suggested tag to apply it to the matching cards, or choose **Delete Moxfield Tag** from a
  tag group's menu to remove it from the deck.
- **Adjustable draw estimates.** Use the gear in the deck's bottom bar to set your target
  probability and choose a fixed turn cutoff or one based on the deck's Commander bracket.

To build the extension locally or add a feature, see the [contributing guide](CONTRIBUTING.md).

## TODO
* Easily change name of tags
* Setting which requires tags in order to add cards
* Easily add shocks/fetch/surveils/scrylands, and the other major named cycles, in-color
