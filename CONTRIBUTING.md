## Contributing

```sh
npm install
npm run dev     # rebuilds dist/ on change
npm run build   # typecheck + production build
npm run check   # typecheck + oxlint + oxfmt --check
npm test        # build, then check each feature on a live Moxfield deck in Chromium
npm run format  # format with oxfmt
```

Load `dist/` as an unpacked extension:

- **Chrome/Edge:** `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/manifest.json`

Reload the extension (and the Moxfield tab) after each rebuild.

`npm test` runs Playwright tests that load the built extension into Chromium (run
`npx playwright install chromium` once first) and check that each feature appears in the right
place on a live Moxfield deck. They need a network connection and open a browser window, since
Moxfield doesn't load in headless Chromium. When Moxfield changes its page, they show which
features it broke.

## Build from source (for add-on reviewers)

With Node.js 24 (the version used for releases), npm, and `zip` on macOS or Linux:

```sh
npm ci
npm run build   # writes the extension to dist/
```

## Publish a GitHub Release

GitHub hosts the extension. Mozilla signs it through AMO's **unlisted** channel so release
Firefox will install it. The repository must be public so Firefox can download the assets
without credentials. No GitHub Pages setup or personal access token is needed.

1. Keep `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` in GitHub **Settings → Environments → amo**.
   Use [API credentials](https://addons.mozilla.org/developers/addon/api/key/) for the
   account that owns `moxite-refinery@nicoponder`.
2. Run `npm run bump -- patch` (or `minor` / `major`). Use a higher version than any already
   submitted to AMO, including listed versions. Commit the version files with the release
   changes and push the commit. Then run the tag-and-push command printed by the script.
3. The tagged workflow builds and validates the extension, uploads matching reviewer source,
   waits for a signed XPI, then publishes it and `updates.json` together in [GitHub Releases](https://github.com/nicoponder/moxite-refinery/releases).
   If only the GitHub publish job fails, retry **failed jobs** to reuse the signed artifact.

Firefox checks the [stable update URL](https://github.com/nicoponder/moxite-refinery/releases/latest/download/updates.json)
embedded in the XPI. The feed points to the signed file **for that tag** and includes its
SHA-256 hash. Keep the newest Firefox release marked **Latest** with both assets present;
the download and feed URLs start working after the first public release.

## Adding a component

1. Create it in `src/components/`. It receives `{ deckId }` as props.
