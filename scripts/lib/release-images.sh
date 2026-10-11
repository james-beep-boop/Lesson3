#!/usr/bin/env bash
# Shared index check: count runnable Linux images, retaining unknown/unknown attestations.
image_platforms_match() {
  jq -e --argjson expected "$2" '
    all(.manifests[];
      .platform.os == "linux" or
      (.platform.os == "unknown" and .platform.architecture == "unknown")) and
    ([.manifests[] | select(.platform.os == "linux") | .platform.architecture] | sort == $expected)
  ' "$1" >/dev/null
}
