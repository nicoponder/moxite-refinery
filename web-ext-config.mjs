// Shared config for `web-ext` (used locally and by .github/workflows/publish-amo.yml).
export default {
  // Keep repo-only files out of the packaged extension.
  ignoreFiles: [
    "amo-metadata.json",
    "web-ext-config.mjs",
    "*.md",
    "package.json",
    "package-lock.json",
  ],
};
