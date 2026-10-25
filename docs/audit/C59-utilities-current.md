# C5.9 utility slice — current source and focused tests

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. This is a bounded C5.9 slice, not a
claim over the remaining `src/lib` catalog. The seven focused unit files below passed **43/43**
tests in the pinned dependency container. The first attempt was a harness-only `EACCES` while
Vitest tried to write the root-owned `.vite-temp` directory under `node_modules`; that raw log is
retained privately and the corrected rerun passed.

## Executed evidence

Command:

```text
npm run test:unit -- --maxWorkers=4 \
  tests/unit/artifactCacheBestEffort.spec.ts \
  tests/unit/artifactCacheCleanup.spec.ts \
  tests/unit/canonicalJson.spec.ts \
  tests/unit/emailAddress.spec.ts \
  tests/unit/emailFormat.spec.tsx \
  tests/unit/sanitizeHtml.spec.ts \
  tests/unit/systemFacts.spec.ts
```

Result: `7` files, `43` tests, exit `0`, Vitest `4.1.12`; raw output is private at
`/home/james/.local/share/lesson3-audit/2026-10-25-bd5f078/logs/c5-utility-generator-focused-rerun.log`.
The failed-user harness log is private at
`/home/james/.local/share/lesson3-audit/2026-10-25-bd5f078/logs/c5-utility-generator-focused.log`.

## Source observations

- `app/src/generator/artifactCache.ts` hashes structured keys with SHA-256, uses unique temporary
  names plus atomic rename, removes stale temporary files once per process, evicts `.bin` entries by
  oldest mtime, and exposes the exact cap/filter used by the system panel. Read/write failures are
  surfaced through the bounded once-per-operation warning seam; ordinary `ENOENT` remains a cold
  miss. Restore invalidation is a separate shell helper and is covered by F-C70-001.
- `app/src/lib/canonicalJson.ts` normalizes a JSON round trip, recursively sorts object keys and
  preserves array order. `undefined` is mapped to a sentinel because it is not JSON text, so it
  cannot collapse into `null` or an empty object.
- `app/src/lib/emailAddress.ts` trims and bounds one recipient to 254 characters, rejects malformed
  domains/consecutive dots and rejects control/newline injection. Header text separately strips C0,
  DEL, NEL, line and paragraph separators and collapses whitespace.
- `app/src/lib/sanitizeHtml.ts` uses DOMPurify over the shared jsdom window with an explicit
  Mammoth-sized tag/attribute allowlist, data attributes disabled, and external HTTP links forced to
  `_blank` with `noopener noreferrer`. No script, style, event, or data URI attributes are allowed.
- `app/src/lib/systemFacts.ts` runs independent PDF/cache probes concurrently, bounds the PDF health
  request, reports `unknown` instead of throwing, names the controlling environment variables, and
  reads the cache cap/filter from the cache module rather than re-deriving them.
- `app/src/lib/rateLimit.ts` uses one parameterized PostgreSQL upsert per bucket/key, fixed-window
  boundaries, shared counters across replicas, and explicit `Retry-After` seconds. Current wire and
  integration slices separately exercised the shared rate-limit store and representative auth,
  export, recovery, messaging and signup buckets.
- `app/src/lib/session.ts` memoizes auth only within a request render and redirects unauthenticated
  callers through `requireUser`; it does not create a cross-request session cache.

## Contract-unit follow-up

Sixteen additional focused unit files passed **127/127** in 1.03 seconds with Vitest `4.1.12`:
clock-skew bounds; display and lesson-detail selection; editing viewport state; offline administrator
recovery; personal-version projection; plan selection; public posture and slug normalization; bundle
visibility; release ancestry/fingerprint; semver conflict rules; server action body limits; version
counts and ordering. The exact runner hash is
`715fe2b01a5ee8fa0160c4ded522f5af40839ec34f967b710f4099e0565ad1f4`; the raw log hash is
`1a7bc37ec8c1d4827a53cf0a260116726cc45ce063103aef13b10d49bcbe6db3`. These checks cover pure
boundary and projection contracts; they do not close the remaining combine/recovery, resolver,
transaction, or deployment families.

Remaining C5.9 work includes the other `src/lib` families, expiry/clock utilities, combine and
recovery primitives outside the already tested suites, and broader deployment/browser coverage.
