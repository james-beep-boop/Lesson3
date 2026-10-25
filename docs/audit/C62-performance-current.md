# C62 performance and load — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). This is a bounded local
HTTP probe against the disposable production-style target, not a Lighthouse or Cloudflare edge
measurement. `k6` and `autocannon` were not installed, so a small Node worker probe was used and
repeated once to check stability.

The probe used four workers for 15 seconds per run and exercised `/login`, `/admin`,
`/api/users/me`, and `/api/lesson-plans`. Run one completed 6,164 requests with no errors; run two
completed 6,512 requests with no errors. Run-one p95/p99 latencies were 16.05/20.59 ms (`/login`),
27.62/32.06 ms (`/admin`), 8.00/9.07 ms (`/api/users/me`), and 6.82/9.52 ms
(`/api/lesson-plans`). The second run remained stable. The latter endpoint returned its expected
403 for the unauthorised probe identity.

The app container rose from 215.2 MiB to 511.2 MiB during the first warm-up and from 511.8 MiB to
529.7 MiB in the repeated run; after ten idle seconds it remained at 511.2 MiB and `/login` still
returned 200 in 9.5 ms. No swap or error condition was observed. Requests advertising gzip received
`Content-Encoding: gzip`; HTML responses were no-cache. The response also exposed the informational
`X-Powered-By: Next.js, Payload` header, which is recorded for C70 hardening review and is not an
accepted finding here.

Source hash: `cb22a54b1c2465e947ab44c1b8ba9116c5a90fab581dcc3c5441e5857a15978b`.
The two private runner hashes are `7599d709574763192860061c09bfef77ea4ec368adfdde19fdc607ee82a6c1c6`
and `ef4723dad654b98b949a5a5219817ad0b998e3766f9d558c80ec3493ff0b7625`; log hashes are
`df8034f3c5396264189b46241538a09b3d00df3e26a8b012566225384e83c704` and
`eaad5f4bfda5e9abd5f9b1ff659d08db69592d53e6b8b303966834934b985d5b`.

No performance finding is accepted. Lighthouse/mobile throttling, route-size attribution, a
longer saturation curve, and shared-edge cache behavior remain deployment-specific follow-ups.

**Exit:** repeated bounded load probe completed without errors or a latency/resource failure; the
known tool and deployment limits are recorded.
