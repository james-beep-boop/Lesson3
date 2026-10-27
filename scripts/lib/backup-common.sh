# Shared configuration and JSON encoding for the backup and setup scripts.
# Unlike ordinary options, an explicit empty destination disables it, including in the environment.
destination_setting() {
  local key="$1" fallback="$2"
  if [[ -v "$key" ]]; then printf '%s' "${!key}"
  elif [[ -f .env ]] && grep -qE "^${key}=" .env; then env_get "$key"
  else printf '%s' "$fallback"; fi
}

positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

reject_unsupported_json_controls() {
  local value="$1" field="$2" i control
  for ((i = 1; i <= 31; i++)); do
    case "$i" in 9|10|13) continue ;; esac
    printf -v control '%b' "\\$(printf '%03o' "$i")"
    [[ "$value" != *"$control"* ]] \
      || die "$field contains an unsupported control character"
  done
}

json_escape() {
  local value="$1" field="$2"
  reject_unsupported_json_controls "$value" "$field"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}
