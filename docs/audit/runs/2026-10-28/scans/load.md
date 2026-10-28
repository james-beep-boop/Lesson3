# Bounded read-load probe — C62 (partial)

Dedicated audit target; exclusive atomic lock held, resource caps checked, health monitored each second, automatic stop on failed health or request errors. Autocannon8.0.0 ran four read scenarios at1/5/10 connections for8 seconds each, capped80 requests/second and5-second request timeout. No fixture writer ran concurrently on the primary database. Container CPU/memory samples remain private.

All12 runs returned640 successful responses each:7,680 total, no transport errors, timeouts, non-2xx responses or health failures. The largest observed p99 was104ms for the authenticated catalogue at10 connections. Detailed sanitized metrics: `load-results.json`.

Limits: one small synthetic lesson fixture, native ARM local target, warm requests, no Cloudflare/shared deployment path. The fixed rate cap was reached; no saturation knee was measured or claimed. These numbers do not establish school capacity, cold export throughput, large-corpus performance, low-bandwidth behaviour or production latency.
