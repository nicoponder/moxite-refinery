#!/bin/sh
# Builds dist/ and signs it on addons.mozilla.org as an unlisted (self-distributed)
# add-on, using the API credentials in .env (JWT_ISSUER, JWT_SECRET). The signed
# .xpi lands in web-ext-artifacts/.
#
# dist/content.js is bundled and minified, so Mozilla's policies require the
# readable source too: it's uploaded as an archive of the last commit, which is
# why uncommitted changes are refused (they'd be built but not uploaded).
set -eu
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "sign: commit or stash your changes first, so the uploaded source matches the build." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "sign: .env not found; it needs JWT_ISSUER and JWT_SECRET from addons.mozilla.org (Tools → Manage API Keys)." >&2
  exit 1
fi
set -a
. ./.env
set +a
: "${JWT_ISSUER:?sign: JWT_ISSUER is missing from .env}"
: "${JWT_SECRET:?sign: JWT_SECRET is missing from .env}"

npm run build

mkdir -p web-ext-artifacts
git archive --format=zip --output=web-ext-artifacts/source.zip HEAD

# The credentials go through web-ext's environment variables rather than
# --api-key/--api-secret, which would show them in the process list.
WEB_EXT_API_KEY="$JWT_ISSUER" WEB_EXT_API_SECRET="$JWT_SECRET" \
  npx --yes web-ext@10.7.0 sign \
  --source-dir dist \
  --artifacts-dir web-ext-artifacts \
  --channel unlisted \
  --upload-source-code web-ext-artifacts/source.zip
