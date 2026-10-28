#!/usr/bin/env bash
# Execute the installer and CI wait step with stubbed HTTP/Compose and an external test clock.
# No daemon, network, live environment or production test switch is used.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/bin"

# Exercise the actual workflow commands, so the test cannot pass against a private copy of the loop.
awk '
  /name: Wait for app health/ { found=1; next }
  found && /run: \|/ { capture=1; next }
  capture && /^          / { sub(/^          /, ""); print; next }
  capture { exit }
' "$ROOT/.github/workflows/ci.yml" >"$TMP/ci-wait.sh"
[[ -s "$TMP/ci-wait.sh" ]] || { echo 'FAIL: CI readiness step not found'; exit 1; }

cat >"$TMP/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$DOCKER_CALLS"
STUB
cat >"$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
budget=missing
status_output=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-time) budget="$2"; shift ;;
    -w|--write-out) status_output=1; shift ;;
  esac
  shift
done
attempt=0
[[ ! -f "$CURL_CALLS" ]] || attempt="$(wc -l <"$CURL_CALLS" | tr -d '[:space:]')"
printf '%s\n' "$budget" >>"$CURL_CALLS"
if [[ "$MODE" == ready || ( "$MODE" == recover && "$attempt" -gt 0 ) ]]; then
  [[ "$status_output" == 0 ]] || printf '307'
  exit 0
fi
if [[ "$MODE" == wrong-status ]]; then
  printf '200'
  exit 0
fi
# Model curl timing out after a connected server never finishes its response.
exit 28
STUB
# Unsetting SECONDS removes Bash's wall-clock behavior. Reassign it as a plain test variable,
# so crossing a real second boundary cannot turn the expected two-second budget into one.
printf 'unset SECONDS\nSECONDS=0\n' >"$TMP/clock-env.sh"
cat >"$TMP/driver.sh" <<'STUB'
#!/usr/bin/env bash
# Advance the caller's Bash clock rather than waiting five minutes or changing production code.
sleep() { SECONDS=$((SECONDS + 298)); }
export -f sleep
exec bash -e -o pipefail "$1"
STUB
chmod +x "$TMP/bin/"*

failures=0
for source in installer ci; do
  for mode in ready recover never wrong-status; do
    [[ "$source:$mode" != installer:wrong-status ]] || continue
    sandbox="$TMP/$source-$mode"
    mkdir "$sandbox"
    if [[ "$source" == installer ]]; then
      cp "$ROOT/deploy/online/install.sh" "$sandbox/wait.sh"
      touch "$sandbox/compose.yaml"
      printf 'v0.0.0\n' >"$sandbox/VERSION"
      printf 'PAYLOAD_SECRET=\nPOSTGRES_PASSWORD=\nDATABASE_URI=REPLACE_WITH_POSTGRES_PASSWORD\nADMIN_URL=\n' >"$sandbox/.env.example"
      marker='ARES Lesson Plans is ready'
    else
      cp "$TMP/ci-wait.sh" "$sandbox/wait.sh"
      marker='app healthy'
    fi
    status=0
    (
      cd "$sandbox"
      PATH="$TMP/bin:$PATH" BASH_ENV="$TMP/clock-env.sh" MODE="$mode" CURL_CALLS="$sandbox/curl" \
        DOCKER_CALLS="$sandbox/docker" bash "$TMP/driver.sh" "$sandbox/wait.sh"
    ) >"$sandbox/output" 2>&1 || status=$?
    expected=$'5\n2'
    [[ "$mode" != ready ]] || expected=5
    passed=1
    [[ "$(cat "$sandbox/curl")" == "$expected" ]] || passed=0
    if [[ "$mode" == ready || "$mode" == recover ]]; then
      [[ "$status" == 0 ]] && grep -q "$marker" "$sandbox/output" || passed=0
    else
      [[ "$status" != 0 ]] && ! grep -q "$marker" "$sandbox/output" \
        && grep -q '^compose logs' "$sandbox/docker" || passed=0
    fi
    if [[ "$passed" == 1 ]]; then
      echo "ok   $source readiness: $mode"
    else
      echo "FAIL $source readiness: $mode (exit $status; request budgets: $(tr '\n' ',' <"$sandbox/curl"))"
      failures=$((failures + 1))
    fi
  done
done
[[ "$failures" == 0 ]]
