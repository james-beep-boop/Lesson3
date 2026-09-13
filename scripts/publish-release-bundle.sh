#!/usr/bin/env bash
# Assemble assets on a draft before publishing; also finish interrupted draft publication.
set -euo pipefail

tag="${1:?usage: publish-release-bundle.sh TAG BUNDLE}"
bundle="${2:?usage: publish-release-bundle.sh TAG BUNDLE}"
[[ -f "$bundle" && -f "$bundle.sha256" ]] || { echo 'release bundle or checksum is missing' >&2; exit 1; }

if state="$(gh release view "$tag" --json isDraft,isPrerelease --jq '[.isDraft, .isPrerelease] | @tsv')"; then
  IFS=$'\t' read -r draft prerelease <<<"$state"
  case "$draft:$prerelease" in
    true:true|true:false|false:true|false:false) ;;
    *) echo "unexpected release state: $state" >&2; exit 1 ;;
  esac
  if [[ "$draft" == false ]]; then
    echo "::warning::release $tag is already published; replacing its bundle assets"
  fi
  gh release upload "$tag" "$bundle" "$bundle.sha256" --clobber
  if [[ "$draft" == true ]]; then
    gh release edit "$tag" --draft=false --prerelease="$prerelease"
  fi
else
  gh release create "$tag" "$bundle" "$bundle.sha256" \
    --draft --verify-tag --generate-notes --title "Lesson3 $tag"
  gh release edit "$tag" --draft=false
fi
