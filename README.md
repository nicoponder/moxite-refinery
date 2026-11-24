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

With Node.js 24 (the version used for AMO releases), npm, and `zip` on macOS or Linux:

```sh
npm ci
npm run build   # writes the extension to dist/
```

## Publish on Firefox Add-ons (AMO)

1. In the [AMO Developer Hub](https://addons.mozilla.org/developers/), confirm that
   `moxite-refinery@nicoponder` in `public/manifest.json` matches your add-on if it already
   exists. Review the listing summary, category, and MIT license in `amo-metadata.json`.
2. [Get AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/) from the
   account that manages the listing. In GitHub **Settings → Environments → amo**, add secrets
   `AMO_JWT_ISSUER` (API key) and `AMO_JWT_SECRET` (API secret).
3. Set `version` in `public/manifest.json` to a version higher than any you've already
   submitted, including for unlisted signing. Commit and push the changes. Then tag that
   commit and push just that tag:

   ```sh
   tag="v$(node -p "require('./public/manifest.json').version")"
   git tag "$tag"
   git push origin "$tag"
   ```

The workflow checks the tag against the built manifest and submits the validated extension
and matching source to AMO's **listed** channel. Check the Developer Hub for review status;
once published, [AMO delivers updates automatically](https://extensionworkshop.com/documentation/manage/updating-your-extension/).

**Mobile:** The same package targets Firefox for Android 142+ (`gecko_android` in the
manifest and `android` in the listing metadata). Before tagging, test a deck on a phone or
emulator using [Mozilla's Android testing instructions](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/).
Firefox on iPhone and iPad cannot install AMO extensions.

## Sign for Firefox (unlisted)

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
