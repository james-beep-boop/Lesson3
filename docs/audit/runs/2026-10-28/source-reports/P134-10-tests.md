# P134-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/http/saveAsNewRecovery.http.spec.ts:1-400`. The range ends inside the body of `lesson3_san_hold()` (line 400), so the rest of that function, the C20 assertions and cleanup, and everything after line 400 are **not assessed**.
- **Not assessed:** the DEL and C29 cases named in the header (lines 9-10), any product source under `app/src`, and the policy excerpts beyond using them as context. I made no tool calls, so I did not verify baseline `6e75a173…`. Nothing here describes runtime behaviour of the endpoint itself, which this file only exercises over HTTP.

## Purpose and invariants (as asserted in 1-400)

The file tests `save-as-new` with edit-recovery tokens over the wire:
- **C7:** a successful token-bearing save retires the capture. Content is cleared, `retired_at` is set, the revision advances by one, and the generation does not move.
- **LEG:** a save without a token returns no `recoveryToken`, retires nothing, and a half-supplied token gets 400 with no retirement.
- **C19:** a DB trigger raises during retirement. The test checks the fault fired exactly once, then expects no orphan version, no retirement, and an intact capture.
- **C20:** a capture landing during an in-flight save must not be silently retired. The interleaving uses a database barrier.

Helpers use a `lesson3_san_*` naming prefix, and the file's installed objects match that prefix.

## Candidates

**No confirmed product defect.** This file only asserts product behaviour; it does not implement it. The items below are test-integrity leads.

1. **C20 retirement counter is not scoped to retirement (test-integrity, low; uncertain).** `installCounter` (lines 360-380) is a `FOR EACH STATEMENT AFTER UPDATE` trigger on all of `edit_recovery`, with no `WHEN` or `source_version_id` filter. It fires for any UPDATE statement on the table, including the second tab's capture, which the interleaving performs inside the measured window (per the comment at lines 346-348). Only the comment at line 373 is accurate: a zero-row retirement still fires a statement trigger. If the C20 assertion expects the counter to equal exactly one retirement attempt, the concurrent capture's UPDATE would inflate it and the test would fail for reasons unrelated to retirement. *Reproduction:* read the assertion after line 400; if it compares the counter to 1 across the whole window, run C20 and log the counter for each UPDATE statement. The check is unconfirmed until those lines are read.

2. **C7 and LEG never verify the saved prose (test gap, low).** `saveForm` (lines 99-114) injects `C7-saved` / `LEG-saved` into `lessons[0].overview`, but no assertion reads the new version back. A save could return 200 with the wrong content and this file would still pass. This is a coverage gap, not a product defect.

3. **C7 sets `expectedRevision` on the second capture only indirectly (informational).** `seedCapture` (lines 84-96) relies on the `start` response for the first revision. This is fine as written and I found no mismatch.

## Checked and not a finding

- `seqValue` (lines 153-159) returns an absolute `last_value` instead of a count. `faultsBefore` makes the C19 delta correct, so this is not a defect.
- The `WHEN` clause in the C19 trigger (lines 264-265) matches the intended retirement transition.

## Unresolved questions

- Does C20 assert exactly one retirement, and does the counter baseline account for the concurrent capture (lines 400+)?
- Do C20's barrier and counter objects get dropped in cleanup, given `installCounter` only drops the trigger with `IF EXISTS` (lines 372) and no visible `afterAll` for it?
- Do DEL and C29 exist in the remainder of the file, and do they assert the header's claims?
