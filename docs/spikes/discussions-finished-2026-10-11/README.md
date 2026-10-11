# Finished-app Discussions timing probe — 2026-10-11

This measures the installed application helpers through Payload 3.90.2, including their normal access
checks and database round trips. It does not measure HTTP latency or browser paint. It complements
rather than replaces the earlier title-search spike.

Use a **disposable migrated production-mode database**, never a real installation. The fixture
setup purges the test namespace; the script changes the forum flag and bulk-inserts benchmark rows.
It deletes only its fixture author's topics/replies/participation before fixture teardown. It requires
`NODE_ENV=production` and an explicit `FORUM_DISPOSABLE_PROBE=yes` acknowledgement.

From the repository root, after starting an isolated app stack with a synthetic `.env`, run:

```bash
scripts/in-deps.sh --network lesson3-forum4b-probe_default --env-file .env \
  -e NODE_ENV=production -e FORUM_DISPOSABLE_PROBE=yes \
  -v "$PWD/docs/spikes/discussions-finished-2026-10-11/measure.mjs:/audit/measure.mjs:ro" \
  -- node --import=tsx/esm /audit/measure.mjs
```

Adjust the network name to the disposable project. `.env` must point to that project's Postgres
service. Mount the single script, not a repository containing `.git` inside the dependency runner.
The script imports `/app`'s installed packages and actual helpers; no parallel minimal schema is used.

Dataset: 5,000 topics, 101,980 replies, one thread with 2,000 replies and one user participating in
500 discussions. Titles alternate English and Swahili. Each helper gets one warm-up and 25 timed
samples; median is the 13th sorted sample, P95 the 24th. Thread pages contain 50 replies.

Output: `app/test-results/discussions-timings.json`. Copy it before Playwright, which clears that
directory. The checked-in results report describes hardware and limitations. Tear down only the
probe project and its volumes afterward. Rock 5B results must be measured separately, never inferred
from the development machine.
