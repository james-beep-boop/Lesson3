#!/usr/bin/env bash
# Called only after main's required gate succeeds. The explicit PR/version authorise one release.
set -euo pipefail

pr=${1:?pull request required}
version=${2:?version required}
[[ "$pr" =~ ^[1-9][0-9]*$ && "$version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || exit 1
[[ "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_EVENT_NAME:-}" == push ]] || exit 1
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
repo=${GITHUB_REPOSITORY:?repository required}

merge_sha=$(gh pr view "$pr" --repo "$repo" --json state,mergeCommit \
  --jq 'if .state == "MERGED" then .mergeCommit.oid else empty end') || exit 1
if [[ -z "$merge_sha" ]] || ! git merge-base --is-ancestor "$merge_sha" "$GITHUB_SHA"; then
  echo "Requested PR has not merged into this checked main commit; leaving the release pending."
  exit 0
fi

if git show-ref --verify --quiet "refs/tags/$version"; then
  [[ "$(git cat-file -t "refs/tags/$version")" == tag ]] || exit 1
  tagged=$(git rev-parse "$version^{commit}")
  git merge-base --is-ancestor "$merge_sha" "$tagged" || exit 1
  git merge-base --is-ancestor "$tagged" "$GITHUB_SHA" || exit 1
  # A rerun may follow tag creation and failed dispatch. Resume its immutable approved tag,
  # including after a later main commit; never move it or republish a completed release.
  note=$(mktemp)
  trap 'rm -f "$note"' EXIT
  if draft=$(gh release view "$version" --repo "$repo" --json isDraft --jq '.isDraft' 2>"$note"); then
    if [[ "$draft" == false ]]; then
      echo "$version is already published."
      exit 0
    fi
  elif ! grep -Eq 'release not found|HTTP 404' "$note"; then
    cat "$note" >&2
    exit 1
  fi
else
  tag_sha=$(gh api "repos/$repo/git/tags" --method POST \
    -f tag="$version" -f message="Lesson3 $version" -f object="$GITHUB_SHA" -f type=commit --jq '.sha') || exit 1
  [[ "$tag_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
  gh api "repos/$repo/git/refs" --method POST -f ref="refs/tags/$version" -f sha="$tag_sha" >/dev/null || exit 1
fi

# workflow_dispatch is explicitly allowed to start another run with GITHUB_TOKEN; tag push is not.
gh workflow run publish-containers.yml --repo "$repo" --ref "$version" || exit 1
echo "Queued publishing of $version on GitHub."
