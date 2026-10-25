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

The slice checks that export clients distinguish cold/warm/poll/error paths and bind document kinds;
editor validation refuses malformed structural edits; recovery/Combine UI boundaries keep their
ownership and merge constraints; idle logout clears visible unsaved-work state; navigation freshness
uses uncached server state; signup trust and upload helpers enforce their shape/size boundaries; and
system feature/flag views preserve their state contracts. Browser navigation, real cookies/CSRF,
WebKit/Chromium rendering, accessibility, visual consistency, and full component coverage remain
open in C5.11/C60/C61.
