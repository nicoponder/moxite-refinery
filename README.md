# Moxite Refinery

A Manifest V3 web extension that renders React components on Moxfield deck pages
(`https://moxfield.com/decks/<deckId>`).

## Develop

```sh
npm install
npm run dev     # rebuilds dist/ on change
npm run build   # typecheck + production build
```

Load `dist/` as an unpacked extension:

- **Chrome/Edge:** `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/manifest.json`

Reload the extension (and the Moxfield tab) after each rebuild.

## Adding a component

1. Create it in `src/components/`. It receives `{ deckId }` as props.
2. Register it in `src/content/injections.ts` with an `anchor` (a function returning
   the element to insert next to) and a `position` (`beforebegin`, `afterbegin`,
   `beforeend` or `afterend`).

The injector (`src/content/injector.tsx`) mounts each component in its own shadow root
and keeps it mounted as Moxfield's single-page app re-renders or navigates between decks.
