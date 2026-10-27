# Run age's terminal-only prompts over a private PTY. The caller keeps PASSWORD in shell memory,
# never exports it, and never puts it in argv. script's transcript is /dev/null and echo is disabled
# before a single byte is sent. AGE_OUTPUT contains tool output only; callers must not log it.
# Needs util-linux script and bash (the same Linux host requirements as backup-db.sh).
with_backup_password() {
  local command character buffer='' pid input output original_in original_out result=0
  printf -v command '%q ' "$@"
  coproc AGE_TOOL { exec script -q -e --echo never -c "$command" /dev/null; }
  pid=$AGE_TOOL_PID; original_in=${AGE_TOOL[1]}; original_out=${AGE_TOOL[0]}
  exec {input}>&"$original_in" {output}<&"$original_out"
  exec {original_in}>&- {original_out}<&-
  AGE_OUTPUT=''
  while IFS= read -r -N 1 -t 120 -u "$output" character; do
    buffer+="$character"
    # The restore verifier may be verbose. Keep only bounded output, not a transcript on disk;
    # trimming at twice the limit keeps the copy cost off every byte.
    AGE_OUTPUT+="$character"
    if (( ${#AGE_OUTPUT} > 32768 )); then AGE_OUTPUT="${AGE_OUTPUT: -16384}"; fi
    # A prompt ends in a colon, so only a colon can complete one.
    if [[ "$character" == : && ( "$buffer" == *'Enter passphrase'*: || "$buffer" == *'Confirm passphrase'*: ) ]]; then
      printf '%s\n' "$PASSWORD" >&"$input"
      buffer=''
    fi
    if (( ${#buffer} > 2048 )); then buffer="${buffer: -256}"; fi
  done
  exec {input}>&- {output}<&-
  wait "$pid" || result=$?
  return "$result"
}
