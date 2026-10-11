# Finished-app Discussions helper timings — 2026-10-11

Measured against the actual application helpers and fully migrated schema, with 5,000 topics,
101,980 replies, a 2,000-reply thread and participation in 500 discussions. One warm-up and 25 samples
per helper; median and P95 below are milliseconds. See [reproducer](README.md).

| Helper | Mac median | Mac P95 | Rock 5B median | Rock 5B P95 |
|---|---:|---:|---:|---:|
| topic list, 20 rows | 7.47 | 13.94 | 32.18 | 99.58 |
| title search, English | 10.09 | 17.56 | 31.15 | 36.00 |
| title search, Swahili | 10.59 | 17.27 | 27.56 | 32.79 |
| title search, no match | 6.89 | 8.55 | 24.72 | 28.12 |
| nav unread, 500 discussions | 0.48 | 0.63 | 1.94 | 2.38 |
| unread markers, 20 rows | 0.59 | 0.81 | 2.26 | 3.12 |
| thread, 2000 replies, page 1 | 6.24 | 12.54 | 19.42 | 28.58 |
| thread, 2000 replies, page 40 | 4.91 | 17.06 | 16.82 | 18.51 |

Both runs use Node 24.21.0, Payload 3.90.2 and the pinned Postgres 16.15 image. The Mac is Docker
ARM64 with 8 CPUs and 7.75 GiB available; Postgres has the application's 512 MiB limit, and its runner
has no extra CPU cap. The Rock has 8 CPUs and 16 GiB physical RAM; the isolated probe caps Postgres
at 512 MiB/2 CPUs and the helper runner at 1.5 GiB/2 CPUs. Its Postgres storage is temporary RAM-backed.
The live Rock services and database were untouched; the probe container and network were removed.

The Mac dependency image uses Next 16.4.0. The Rock's existing dependency image uses Next 16.3.6;
it ran a scratch copy of the current source and schema, not the deployed application tree. These are
**helper/database timings**, with no Next route rendering, browser paint, transport time or concurrent
user load. They are not a full Rock application gate or equivalent hardware comparisons. Outside
React rendering, render-scoped caching does not deduplicate flag reads; helper timings include those
reads. The local production HTTP/browser checks use the pinned Next 16.4.0 build.

On this dataset the existing Payload title search remains practical without an additional search
index or package. The Rock's topic-list P95 outlier is retained. Twenty-five warm samples do not
establish worst-case latency or multi-user capacity. No release or deployment was performed.

The first probe emitted its results and completed fixture/database cleanup but retained imported
process handles. The standalone reproducer now exits successfully only after cleanup; a thrown
measurement or cleanup error still fails. This is probe harness behavior, not an application change.
