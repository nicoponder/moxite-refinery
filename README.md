# Moxite Refinery

A Manifest V3 web extension that renders React components on Moxfield deck pages
(`https://moxfield.com/decks/<deckId>`).

## Develop

```sh
npm install
npm run dev     # rebuilds dist/ on change
npm run build   # typecheck + production build
npm run check   # typecheck + oxlint + oxfmt --check
npm run format  # format with oxfmt
```

Load `dist/` as an unpacked extension:

- **Chrome/Edge:** `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/manifest.json`

Reload the extension (and the Moxfield tab) after each rebuild.

## Build from source (for add-on reviewers)

With Node.js 20 or later (built with 26) on macOS or Linux:

```sh
npm install
npm run build   # writes the extension to dist/
```

## Sign for Firefox

Put addons.mozilla.org API credentials (Tools → Manage API Keys) in `.env`:

```sh
JWT_ISSUER=user:12345:678
JWT_SECRET=...
```

Then bump `version` in `public/manifest.json`, commit, and run `npm run sign`. It
builds, uploads `dist/` with this repository's source for an unlisted signature,
and saves the signed `.xpi` in `web-ext-artifacts/`.

## Adding a component

1. Create it in `src/components/`. It receives `{ deckId }` as props.
2. Register it in `src/content/injections.ts` with an `anchor` (a function returning
   the element to insert next to) and a `position` (`beforebegin`, `afterbegin`,
   `beforeend` or `afterend`).

The injector (`src/content/injector.tsx`) mounts each component in its own shadow root
and keeps it mounted as Moxfield's single-page app re-renders or navigates between decks.
