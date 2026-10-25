# C5.11 client/component slice — current focused tests

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. This is a bounded client/component slice,
not a browser or full C5.11 claim. Fifteen focused unit files passed **108/108** tests in the pinned
dependency container, covering export preparation and polling, export-kind/document rules, editor
validation, recovery/Combine boundaries, idle logout screen clearing, navigation freshness, signup
trust/UI guards, upload parsing, and system panel/flag state.

Command output is retained privately at
`/home/james/.local/share/lesson3-audit/2026-10-25-bd5f078/logs/c5-client-component-focused.log`.
The command exited `0` with Vitest `4.1.12`: 15 files, 108 tests, 2.32 seconds. The tests are
isolated and do not mutate the live target.

The CI-equivalent `lesson3-e2e` image also ran the real Chromium
`tests/e2e/editorValidation.e2e.spec.ts` against the marked target. The no-retry run passed **1/1**
in 6.9 seconds; the exact runner hash is
`9a22fa80f3cc3f6f628e29e56647e9e9852fe82b041b2a163c3623ff953cf91e`. A preceding `CI=true` run
had one transient focus failure on the first attempt and passed on Playwright retry; its raw log is
retained separately. The target lock released and fixture teardown left the app healthy.

The slice checks that export clients distinguish cold/warm/poll/error paths and bind document kinds;
editor validation refuses malformed structural edits; recovery/Combine UI boundaries keep their
ownership and merge constraints; idle logout clears visible unsaved-work state; navigation freshness
uses uncached server state; signup trust and upload helpers enforce their shape/size boundaries; and
system feature/flag views preserve their state contracts. This closes one real Chromium
editor-validation flow.

The CI-equivalent Chromium run of `tests/e2e/manage.e2e.spec.ts` against the normal Mailpit target
reached **37/38** tests before one assertion failed on all retries. The failing assertion expected
`Awaiting approval` for a synthetic unverified account, while the rendered state was `Teacher ·
Unverified`. This is a test-environment contract mismatch, not a product finding: the target app was
running with `SMTP_HOST=mail`, and `AdminDashboard` derives `emailEnabled` from that variable before
passing it to `UsersPanel`; `UsersPanel` consequently renders `Unverified` and offers `Mark verified`.
The test comment and assertion hard-code the no-SMTP branch. The raw log is retained privately at
`logs/c5-11-manage-e2e-ci-image.log` (SHA-256
`46f7acc1f7c672e1d83160d2ab412e38dd7c66ace22e4384c996acc6b7240219`).

The same browser flow was then run against a temporary app process on the target network with
`SMTP_HOST` explicitly empty. It passed **38/38** in 45 seconds, including the `Awaiting approval` /
`Approve` path. The exact private runner hash is
`06379352c50cdd2566501c61f87fc60b2d3636055cf1f33f2d44cc5dcd5f57ae`; the raw log hash is
`f5a778a1b883006d572b71e3b5dcef2745d036713d10098cdc65a3518b57d02f`. Both SMTP branches therefore
match their source contracts. The 37 Mailpit-target passing tests exercise account actions, roles,
system panels, taxonomy and self display-name behavior.

Browser navigation breadth, real cookies/CSRF across roles, WebKit rendering, accessibility, visual
consistency, and full component coverage remain open in C5.11/C60/C61.
