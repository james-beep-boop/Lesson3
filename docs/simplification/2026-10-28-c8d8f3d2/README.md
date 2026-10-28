# ARES Lesson Plans: v1.10 simplification review

**Status: Claude reviewed the original five cleanup PRs; no merges authorized.**
Review source: annotated `v1.10`, commit `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`.
Fixes were rechecked against main `e304387b`, preserving its newer sign-in tagline.

## Review and limits

Reuse, simplicity, efficiency and altitude were reviewed, with project conventions throughout.
Sol handled coordination/complex layering, Luna bounded investigations, Terra guidance. This was
not a security audit or a deployed-school performance benchmark.

The inventory accounts for all 940 tracked paths: 808 reviewed files, 76 migration boundaries and
56 explicit exclusions. Generated DDL, pristine vendor code and binaries were not claimed manually
read. Configuration and test harnesses received the checks appropriate to their role.

**Correction after Claude's review:** manual coverage did not establish a satisfactory dead-code
audit. The first Knip run lacked project entry points and its findings were not fully triaged.
The configured follow-up, dispositions and limitations are in [first-pass/README.md](first-pass/README.md).

Keep the repository report short. Full coverage, packets, reviewer notes, original execution plan,
verification snapshots and raw scan data remain on the [evidence branch](https://github.com/james-beep-boop/Lesson3/tree/review/simplification-v1.10-evidence), not in this PR's
proposed main-tree changes. Links there preserve the detailed record without importing 8,500 lines.

## Cleanup PRs

| PR | Change | Review status |
|---|---|---|
| [474](https://github.com/james-beep-boop/Lesson3/pull/474) | Batch import ancestry reads. | Claude: correct; optional benefit. |
| [475](https://github.com/james-beep-boop/Lesson3/pull/475) | Correct teacher and technician guidance. | Claude: correct, most valuable. |
| [476](https://github.com/james-beep-boop/Lesson3/pull/476) | Reuse the database pool accessor. | Claude: correct. |
| [478](https://github.com/james-beep-boop/Lesson3/pull/478) | Put pure prose vocabulary below enforcement. | Claude: correct; requested comment restored in edfd52cc. |
| [479](https://github.com/james-beep-boop/Lesson3/pull/479) | Reuse immutable save comparison. | Claude: correct. |
| [480](https://github.com/james-beep-boop/Lesson3/pull/480) | Configure dead-code checks; remove three unused declarations. | New draft; needs Claude's review and CI. |

The original five had green CI when Claude reviewed them. #478's comment-only push reruns CI;
#480 has types/lint/format, 1,976 unit tests and 16 contract checks passing locally. PR checks remain
the current CI source of truth. No schema/renderer change was needed.

## Outcome and next work

See [findings.md](findings.md) for chosen fixes/deferred items and [cross-group.md](cross-group.md)
for shared-flow reasoning. The timeout follow-up remains the useful next reliability task.
James chose to delete contractDriftSummary; upload contract validation already blocks invalid input.

All cleanup PRs remain drafts. Claude's review does not itself lift James's explicit merge hold.
No tag, release, deployment or live configuration change is included.
