#!/usr/bin/env bash
# Resolve the exact pins inside the built bundle before publishing it. No image layers are pulled.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/release-images.sh"

bundle="${1:?usage: verify-release-bundle-images.sh BUNDLE VERSION}"
version="${2:?usage: verify-release-bundle-images.sh BUNDLE VERSION}"
fail() { echo "verify-release-bundle-images: $*" >&2; exit 1; }
[[ "$(tar -xOf "$bundle" lesson3-deploy/VERSION)" == "$version" ]] || fail 'incorrect bundle version'
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
tar -xOf "$bundle" lesson3-deploy/compose.yaml >"$work_dir/compose.yaml"

for package in app migrate; do
  ref="$(awk -v package="$package" '$1 == "image:" && $2 ~ "^ghcr.io/[^/]+/lesson3-" package ":" {print $2}' "$work_dir/compose.yaml")"
  [[ "$ref" =~ ^ghcr\.io/[a-z0-9_.-]+/lesson3-${package}:v[0-9]+\.[0-9]+(\.[0-9]+)?@sha256:[0-9a-f]{64}$ ]] \
    && [[ "${ref%@*}" == *":$version" ]] || fail "missing or invalid $package pin"
  docker buildx imagetools inspect "$ref" --format '{{json .Manifest}}' >"$work_dir/$package.json"
  image_platforms_match "$work_dir/$package.json" '["amd64","arm64"]' \
    || fail "$package pin does not resolve on both architectures"
  jq -e --arg digest "${ref##*@}" '.digest == $digest' "$work_dir/$package.json" >/dev/null \
    || fail "$package resolved digest differs from its pin"
  echo "verified: $package bundle pin supports linux/amd64 and linux/arm64"
done
