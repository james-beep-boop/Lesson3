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

The dedicated `tests/e2e/offlineSignup.e2e.spec.ts` then passed **1/1** against the same temporary
SMTP-disabled app in 6.5 seconds. It covered the complete offline journey: sign-up copy, pre-approval
login refusal, the Site Administrator's approval queue and final teacher sign-in. The exact private
runner hash is `763394dfac4e5c4120819f985893f6d6451741d08c4ef236714aadb9774618da`; the raw log hash is
`7ca65295d942e42250a198efa823c2037a444e22130f02617f2810ecb3773d99`.

Two additional CI-equivalent Chromium flows passed against the normal Mailpit target: `liveRowLabels`
passed **2/2** in 8.6 seconds (live labels through edit/reorder and exact rapid prose save), and
`editorBackDarkMode` passed **1/1** in 4.6 seconds (dark-mode device handling, light admin shell and
readable Back navigation). Their runner hashes are `06a9345a63441f1d338e66906ca300598880f3df6b74715c32368f4e5d1774c2`
and `a70fb36736fad2bf096b1f28776fa24a8becaf3c94497976b76692e339a92e87`; raw log hashes are
`f3a041a826de18ce5812dc9abea391c115925faa30fce5810de90f9f62036196` and
`890b9067d6b20a46987700a2f50087fecc9ef9f6a19ec182d19f0499d2666953`.

The Chromium `tests/e2e/versionUnavailable.e2e.spec.ts` flow passed **6/6** in 7.5 seconds. It
covered deleted and malformed lesson versions, the no-version Official fallback, an existing version,
and both deleted/existing comparison sides without substituting content. The runner hash is
`0e4a0e788a30456f546d459d8ee0f04fffa661cb02cde091710389ac7998f4be`; the raw log hash is
`bba3c00690a434440e003dce94397d9bf7725bb73fed98c1a8a0c46fee8df3c8`.

The Chromium `tests/e2e/lessonDetails.e2e.spec.ts` flow passed **2/2** in 5.8 seconds for both a
Teacher and a Teacher with editing access inspecting the selected version in Standard mode. Runner
hash: `fa6cfa51dedeb4092dba269d277c68c951f7a70b48c3ddf01af4607901f6bc8d`; raw log hash:
`1cc6f48f598c93218c2be75e31e69286ef32d694f0d0b16d6f6d77a88b54c5cd`.

Browser navigation breadth, real cookies/CSRF across roles, WebKit rendering, accessibility, visual
consistency, and full component coverage remain open in C5.11/C60/C61.
