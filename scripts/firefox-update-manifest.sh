#!/usr/bin/env bash
# Generate updates.json from the signed release asset, not the unsigned build zip.
set -euo pipefail
tag=${1:?Usage: firefox-update-manifest.sh TAG SIGNED_XPI}
xpi=${2:?Missing signed XPI}
manifest=$(unzip -p "$xpi" manifest.json)
feed=$(jq -er '.browser_specific_settings.gecko.update_url' <<< "$manifest")
if [[ "$feed" != https://*/releases/latest/download/updates.json || "v$(jq -er .version <<< "$manifest")" != "$tag" ]]; then
  echo "Signed XPI has the wrong version for $tag or is missing its GitHub update URL." >&2
  exit 1
fi

url="${feed%/latest/download/updates.json}/download/$tag/moxite-refinery.xpi"
digest=$(shasum -a 256 < "$xpi")
jq -e --arg url "$url" --arg hash "sha256:${digest%% *}" '{
  addons: {
    (.browser_specific_settings.gecko.id): {
      updates: [{version, update_link: $url, update_hash: $hash}]
    }
  }
}' <<< "$manifest"
