#!/usr/bin/env bash
# Pure packaging checks for the GitHub Release deployment bundle. No images are pulled or started.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "test-local-deploy-bundle: FAIL: $*" >&2; exit 1; }

app_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
migrate_digest="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
"$ROOT/scripts/build-local-deploy-bundle.sh" \
  v0.0.0 "$TMP/assets" "$app_digest" "$migrate_digest" >/dev/null
(
  cd "$TMP/assets"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c lesson3-online-deploy.tar.gz.sha256
  else
    expected="$(awk '{print $1}' lesson3-online-deploy.tar.gz.sha256)"
    actual="$(shasum -a 256 lesson3-online-deploy.tar.gz | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || fail "archive checksum mismatch"
  fi
  tar -xzf lesson3-online-deploy.tar.gz
)

BUNDLE="$TMP/assets/lesson3-deploy"
[[ "$(cat "$BUNDLE/VERSION")" == "v0.0.0" ]] || fail "VERSION was not packaged"
! grep -Eq '__LESSON3_(IMAGE_TAG|APP_DIGEST|MIGRATE_DIGEST)__|:latest' "$BUNDLE/compose.yaml" \
  || fail "release compose contains a mutable or unresolved image tag"
grep -Eq "lesson3-app:v0\\.0\\.0@$app_digest" "$BUNDLE/compose.yaml" \
  || fail "app tag or digest missing"
grep -Eq "lesson3-migrate:v0\\.0\\.0@$migrate_digest" "$BUNDLE/compose.yaml" \
  || fail "migrate tag or digest missing"
! grep -Eq '^[[:space:]]+build:' "$BUNDLE/compose.yaml" \
  || fail "release compose builds on the server"

bash -n "$BUNDLE/install.sh" "$BUNDLE/update.sh" "$BUNDLE/scripts/"*.sh
(
  cd "$BUNDLE"
  test_admin_url='http://lesson3-box:3001/base?first=one&second=two'
  LESSON3_URL="$test_admin_url" ./install.sh --prepare-only
  [[ "$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env)" == "600" ]] \
    || fail ".env permissions are not 600"
  secret="$(grep '^PAYLOAD_SECRET=' .env | cut -d= -f2-)"
  password="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
  [[ "$secret" =~ ^[0-9a-f]{64}$ ]] || fail "PAYLOAD_SECRET was not generated"
  [[ "$password" =~ ^[0-9a-f]{64}$ ]] || fail "POSTGRES_PASSWORD was not generated"
  grep -Eq "^DATABASE_URI=postgres://lesson3:${password}@postgres:5432/lesson3$" .env \
    || fail "DATABASE_URI password does not match POSTGRES_PASSWORD"
  grep -Fq "ADMIN_URL=$test_admin_url" .env \
    || fail "ADMIN_URL metacharacters were not preserved literally"
  docker compose config --quiet
  images="$(docker compose config --images)"
  [[ "$(printf '%s\n' "$images" | wc -l | tr -d '[:space:]')" == "4" ]] \
    || fail "release compose does not resolve exactly four images"
  while IFS= read -r image; do
    [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]] \
      || fail "release image is not digest-pinned: $image"
  done <<<"$images"
  if ./install.sh --prepare-only >/dev/null 2>&1; then
    fail "installer overwrote an existing .env"
  fi
)

"$ROOT/scripts/build-local-deploy-bundle.sh" \
  v0.1 "$TMP/new-assets" "$app_digest" "$migrate_digest" >/dev/null
tar -C "$TMP/new-assets" -xzf "$TMP/new-assets/lesson3-online-deploy.tar.gz"
NEW_BUNDLE="$TMP/new-assets/lesson3-deploy"

missing_target="$TMP/missing-key-target"
cp -R "$BUNDLE" "$missing_target"
sed -i.bak '/^ADMIN_URL=/d' "$missing_target/.env"
rm "$missing_target/.env.bak"
if "$NEW_BUNDLE/update.sh" "$missing_target" >"$TMP/missing.out" 2>&1; then
  fail "updater accepted an environment missing a new-template key"
fi
grep -Eq 'existing \.env is missing keys' "$TMP/missing.out" \
  || fail "updater did not explain the missing environment key"

downgrade_target="$TMP/downgrade-target"
cp -R "$BUNDLE" "$downgrade_target"
printf '%s\n' v0.0.1 >"$downgrade_target/VERSION"
if "$BUNDLE/update.sh" "$downgrade_target" >"$TMP/downgrade.out" 2>&1; then
  fail "updater accepted a version downgrade"
fi
grep -Eq 'refusing downgrade' "$TMP/downgrade.out" \
  || fail "updater did not explain the refused downgrade"

pull_failure_target="$TMP/pull-failure-target"
cp -R "$BUNDLE" "$pull_failure_target"
stub_bin="$TMP/stub-bin"
mkdir -p "$stub_bin"
cat >"$stub_bin/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-} ${2:-}" == "compose version" ]]; then
  exit 0
fi
if [[ "${1:-} ${2:-}" == "compose pull" ]]; then
  exit 1
fi
exit 2
EOF
chmod +x "$stub_bin/docker"
if PATH="$stub_bin:$PATH" ALLOW_UNBACKED_UPDATE=1 \
  "$NEW_BUNDLE/update.sh" "$pull_failure_target" >"$TMP/pull-failure.out" 2>&1; then
  fail "updater succeeded after an image pull failure"
fi
[[ "$(cat "$pull_failure_target/VERSION")" == "v0.0.0" ]] \
  || fail "updater changed VERSION before images downloaded successfully"

echo "test-local-deploy-bundle: PASS"
