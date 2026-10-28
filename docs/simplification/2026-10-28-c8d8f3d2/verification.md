# Selected cleanup verification

Evidence snapshot on 2026-10-28. All PRs remain drafts for Claude; none is merged. A green row is
verification evidence, not merge permission. Application fixes start from main e304387b, while the
review source remains v1.10 c8d8f3d2. No live school or demo database was used for fixture tests.

| PR | Head | Local evidence | GitHub CI at this checkpoint |
|---|---|---|---|
| [474](https://github.com/james-beep-boop/Lesson3/pull/474) | 1c7469e5 | Two new ancestry-query regressions failed before fix; 27 re-ingest integration cases and 29 relevant unit cases pass after, plus types/lint/format. Preliminary Claude challenge corrected first-versus-any decision handling. | All four checks green; run 40656904905. |
| [475](https://github.com/james-beep-boop/Lesson3/pull/475) | 3a81ea15 | 105 Guide-related unit cases; changed-source lint, formatting and diff checks pass. Wording compared with implementation; no behavior change. | All four checks green; run 40657531753, including browser suite. |
| [476](https://github.com/james-beep-boop/Lesson3/pull/476) | b0c81f53 | All 1,976 unit cases and nine rate-limit/auth integration cases pass, plus types/lint/format. SQL, result/error and transaction behavior compared directly. | All four checks green; run 40657938178. |
| [478](https://github.com/james-beep-boop/Lesson3/pull/478) | c124f976 | 204 focused cases plus all 1,976 unit cases pass, plus types/lint/format. Moved key/label block compared byte-for-byte; no schema or renderer changes. | All four checks green; run 40658949119. |
| [479](https://github.com/james-beep-boop/Lesson3/pull/479) | a04a8a55 | All 1,976 unit cases, types, changed-file lint and formatting pass. Immutable request-side reuse only; fresh post-wait permission filtering retained. | Native ARM and restore-stack green; main checks still running in run 40660640129. Endpoint/pending-authority wire checks must finish before merge. |

Local integration checks used disposable explicitly named Compose probes; tracked test.env was restored
and probe stacks removed. No codegen or schema migration was needed for these changes. Report JSON
was parsed and checked against all 940 tag-tracked paths, with uniqueness and exact set equality.
The report branch's own CI is separate from these implementation runs.

Claude's full review of the drafts is still pending. The preliminary read-only CLI challenge on 474
is recorded as evidence, not as a substitute for James's requested Claude review or instruction to
proceed. Releases, deployment and existing installation settings are untouched.
