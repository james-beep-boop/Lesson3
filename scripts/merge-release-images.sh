#!/usr/bin/env bash
# Combine native release images only after both architectures are verified. No build or emulation.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/release-images.sh"

image="${1:?usage: merge-release-images.sh IMAGE VERSION}"
version="${2:?usage: merge-release-images.sh IMAGE VERSION}"
fail() { echo "merge-release-images: $*" >&2; exit 1; }
[[ "$version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || fail 'expected a versioned release tag'
[[ "$image" == ghcr.io/*/lesson3-app || "$image" == ghcr.io/*/lesson3-migrate ]] \
  || fail 'expected a Lesson3 release image'

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

sources=()
for arch in amd64 arm64; do
  metadata="$work_dir/$arch.json"
  docker buildx imagetools inspect "$image:$version-$arch" --format '{{json .Manifest}}' >"$metadata"
  image_platforms_match "$metadata" "[\"$arch\"]" || fail "incorrect platform in $arch image"
  digest="$(jq -er '.digest | select(type == "string" and test("^sha256:[0-9a-f]{64}$"))' "$metadata")" \
    || fail "invalid digest in $arch image"
  sources+=("$image@$digest")
done

# Check the proposed index before moving the release tag. Use the inspected digests, never mutable
# tag references, and omit --append so retries cannot retain obsolete architecture descriptors.
docker buildx imagetools create --dry-run "${sources[@]}" >"$work_dir/preview.json"
image_platforms_match "$work_dir/preview.json" '["amd64","arm64"]' || fail 'incomplete proposed image'
docker buildx imagetools create --tag "$image:$version" "${sources[@]}"
docker buildx imagetools inspect "$image:$version" --format '{{json .Manifest}}' >"$work_dir/published.json"
image_platforms_match "$work_dir/published.json" '["amd64","arm64"]' || fail 'incomplete published image'
echo "verified: $image:$version contains linux/amd64 and linux/arm64"
