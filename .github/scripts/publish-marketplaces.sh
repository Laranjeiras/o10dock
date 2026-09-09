#!/usr/bin/env bash
# Publishes the packaged .vsix to the VS Code Marketplace and Open VSX.
#
# Both marketplaces occasionally report a gateway timeout after the upload has
# already succeeded, so a retry legitimately finds the version published. That
# is the desired end state, not a failure: "already exists" is treated as
# success to keep the release idempotent.
set -euo pipefail

VERSION="${1:?usage: publish-marketplaces.sh <version>}"
VSIX="o10dock-${VERSION}.vsix"

if [ ! -f "$VSIX" ]; then
  echo "::error::Package $VSIX not found."
  exit 1
fi

publish_with_retry() {
  local label="$1"
  local already_published_pattern="$2"
  shift 2

  for attempt in 1 2 3; do
    echo "::group::$label publish attempt $attempt"
    set +e
    output="$("$@" 2>&1)"
    status=$?
    set -e
    echo "$output"
    echo "::endgroup::"

    if [ "$status" -eq 0 ]; then
      return 0
    fi

    if echo "$output" | grep -qiE "$already_published_pattern"; then
      echo "::notice::$label already has ${VERSION}; treating as published."
      return 0
    fi

    echo "::warning::$label publish attempt $attempt failed"
    if [ "$attempt" -lt 3 ]; then
      sleep "$((attempt * 30))"
    fi
  done

  echo "::error::$label publish failed after 3 attempts"
  return 1
}

if [ -n "${VSCE_PAT:-}" ]; then
  publish_with_retry "VS Code Marketplace" "already exists" \
    npx @vscode/vsce publish --packagePath "$VSIX"
else
  echo "::warning::VSCE_PAT is not set; skipping VS Code Marketplace publish."
fi

if [ -n "${OVSX_PAT:-}" ]; then
  # Open VSX is a secondary target: a failure there must not fail the release.
  if ! publish_with_retry "Open VSX" "already (exists|published)" \
    npx ovsx publish "$VSIX" --pat "$OVSX_PAT"; then
    echo "::warning::Open VSX publish failed; continuing since it is not the primary marketplace."
  fi
else
  echo "::warning::OVSX_PAT is not set; skipping Open VSX publish."
fi
