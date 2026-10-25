#!/usr/bin/env bash
# Reset ONLY the marked synthetic database of a validated audit target.
# Raw output and optional synthetic pg_dump archives stay in TARGET_DIR/private.
set -euo pipefail
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo 'Usage: reset-test.sh TARGET_DIR [SYNTHETIC_DUMP_TO_RESTORE]' >&2
  exit 64
fi
target_dir="$(cd "$1" && pwd -P)"
if [ "${LESSON3_AUDIT_LOCK_DIR:-}" != "$target_dir/state/target.lock" ]; then
  exec bash "$(dirname "$0")/with-target-lock.sh" "$target_dir" bash "$0" "$@"
fi
test -n "${LESSON3_AUDIT_LOCK_TOKEN:-}"
test "$(cat "$LESSON3_AUDIT_LOCK_DIR/token")" = "$LESSON3_AUDIT_LOCK_TOKEN"
python3 - "$target_dir" "${2:-}" <<'PY'
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit

root = pathlib.Path(sys.argv[1]).resolve()
identity = json.loads((root / 'state/identity.json').read_text())
project = identity['project']
assert re.fullmatch(r'l3audit-[a-z0-9-]+', project), 'Refuse a non-audit Compose project'
assert identity['purpose'] == 'synthetic-disposable-audit'
assert re.fullmatch(r'[0-9a-f]{40}', identity['sourceSHA'])
assert identity['sourceSHA'] == (root / 'state/source-sha').read_text().strip()
subprocess.run(['git', '-C', identity['sourceCheckout'], 'diff', '--quiet', identity['sourceSHA'], '--', '.', ':(exclude)docs/audit/**', ':(exclude)app/tests/audit/**'], check=True)
config = root / 'private/compose.json'
assert hashlib.sha256(config.read_bytes()).hexdigest() == (root / 'state/config.sha256').read_text().strip(), 'Target configuration changed; inspect and reapprove its identity first'
docker = '/usr/bin/docker'
compose = [docker, 'compose', '-p', project, '--env-file', str(root / 'private/runtime.env'), '-f', str(config)]
resolved = json.loads(subprocess.check_output([*compose, 'config', '--format', 'json']))
assert resolved['name'] == project
assert all(network['name'].startswith(project + '_') for network in resolved['networks'].values()), 'Refuse a network outside this audit namespace'
uri = urlsplit(resolved['services']['app']['environment']['DATABASE_URI'])
assert uri.hostname == 'postgres' and uri.path == '/lesson3' and uri.username == 'lesson3'
assert resolved['services']['app']['environment']['SMTP_HOST'] == 'mail'
for service in resolved['services'].values():
    assert all(port.get('host_ip') == '127.0.0.1' for port in service.get('ports', [])), 'Audit reset refuses non-loopback published ports'
    for volume in service.get('volumes', []):
        if volume['type'] == 'bind':
            assert pathlib.Path(volume['source']).resolve().is_relative_to(root)
for volume in resolved['volumes'].values():
    assert volume['name'].startswith(project + '_')
pg = subprocess.check_output([*compose, 'ps', '-q', 'postgres'], text=True).strip()
assert pg, 'No audit PostgreSQL container'
inspection = json.loads(subprocess.check_output([docker, 'inspect', pg]))[0]
assert inspection['Config']['Labels']['com.docker.compose.project'] == project
psql = [*compose, 'exec', '-T', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'lesson3', '-d', 'postgres']
marker = subprocess.check_output([*psql, '-Atc', "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='lesson3'"], text=True).strip()
assert marker == project, 'Database marker does not identify this audit run'
dump = pathlib.Path(sys.argv[2]).resolve() if sys.argv[2] else None
if dump:
    assert dump.is_relative_to(root / 'private') and dump.is_file(), 'Restore accepts only this target’s private synthetic dump'
start = time.monotonic()
subprocess.run([*compose, 'stop', 'app', 'pdf-private'], check=True)
subprocess.run([*compose, 'exec', '-T', 'postgres', 'dropdb', '--force', '-U', 'lesson3', 'lesson3'], check=True)
subprocess.run([*compose, 'exec', '-T', 'postgres', 'createdb', '-U', 'lesson3', 'lesson3'], check=True)
if dump:
    with dump.open('rb') as stream:
        subprocess.run([*compose, 'exec', '-T', 'postgres', 'pg_restore', '--exit-on-error', '--no-owner', '-U', 'lesson3', '-d', 'lesson3'], stdin=stream, check=True)
subprocess.run([*psql, '-c', f"COMMENT ON DATABASE lesson3 IS '{project}'"], check=True)
subprocess.run([*compose, 'run', '--rm', '--no-deps', 'migrate'], check=True)
# A database reset reuses numeric IDs, so invalidate this target's caches before writers restart.
for service in ('app', 'pdf-private'):
    subprocess.run([*compose, 'run', '--rm', '--no-deps', '--entrypoint', 'sh', service, '-c', 'd="${ARTIFACT_CACHE_DIR:-/var/cache/lesson3}"; if [ -d "$d" ]; then find "$d" -mindepth 1 -maxdepth 1 -type f -delete; fi'], check=True)
subprocess.run([*compose, 'up', '-d', '--no-deps', 'app', 'pdf-private'], check=True)
for _ in range(60):
    result = subprocess.run([*compose, 'exec', '-T', 'app', 'node', '-e', "fetch('http://localhost:3000/login').then(async r=>{const text=await r.text();process.exit(r.status===200&&(text.includes('Create Site administrator')||text.includes('Sign in'))?0:1)}).catch(()=>process.exit(1))"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode == 0:
        break
    time.sleep(2)
else:
    raise SystemExit('Audit app did not recover after reset; leave evidence and target lock reconciliation to the operator')
print(json.dumps({'operation': 'restore' if dump else 'reset', 'seconds': round(time.monotonic()-start, 2), 'healthy': True}))
PY
