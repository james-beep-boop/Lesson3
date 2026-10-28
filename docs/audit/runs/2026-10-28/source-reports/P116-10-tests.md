# P116-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

I read the four supplied ranges in full, from the text in the request. I made no tool calls, so I did not confirm that this text matches baseline `6e75a173` or the worktree.

- `app/tests/helpers/editRecovery.ts:1-296`
- `app/tests/helpers/editRecoveryUi.ts:1-79`
- `app/tests/helpers/fakeReq.ts:1-45`
- `app/tests/helpers/fieldTree.ts:1-43`

**Not assessed:** `src/lib/editRecovery/kernel.ts` (`start`, `capture`, `retire`), the `edit_recovery` schema and migrations, `hooks/fieldSplit.ts`, the guards that `fakeReq.ts` stubs, and all spec callers. I have not checked any runtime behaviour.

## Purpose and invariants (as stated in the source)

- **editRecovery.ts:** Fixture SQL and bound wrappers for `edit_recovery` rows. Setup goes through `drizzleOf`, not `txDb`, and avoids calling `retire()`/`start()` so that tests do not pass vacuously. The stated convention is `(payload, versionId, userId)`.
- **editRecoveryUi.ts:** Playwright helpers. `awaitCaptured` waits for the `--ok` tone, which is the server-confirmed signal.
- **fakeReq.ts:** Dependency-free request stubs for body-guard unit specs. `statusOf` reads an APIError status.
- **fieldTree.ts:** Finds the "Plan and sub-strand details" collapsible by label and throws if it is missing.

## Candidates

I found **no product correctness, integrity, security, or user-visible defect** in these ranges. They are all test helpers. The items below are test-integrity leads, all rated Low.

**C1 (Low, confirmed local reasoning).** `editRecovery.ts:102-108, 115-125, 143-153, 162-172`
- `setRecoveryProvenance` (`184-212`) throws when no row exists, and its comment (`190-194`) names this as the rule.
- `retireDirectly`, `ageRecoveryRow`, `setRecoveryContent` and `setRecoveryUpdatedAt` do not check, so a zero-row UPDATE succeeds silently.
- Precondition: no `edit_recovery` row for the (user, version) pair.
- Expected: a fixture error. Actual: the call resolves and the test runs against a different state.
- Reproduction: seed no row, then `await expect(setRecoveryContent(payload, v, u, {})).rejects.toThrow()`. It currently resolves.
- The comment at `190-194` also says `startFor` "already applies the rule". `startFor` (`263-266`) checks only the cap result, not row existence, so the comment overstates it.

**C2 (Low, confirmed local reasoning).** `editRecovery.ts:270-276` (`captureFor`), and `285-288` (`rawRow`, `countRows`)
- `captureFor` takes `generation: number, expectedRevision: number` positionally, so swapping them type-checks and runs.
- The header (`217-221`) says positional drift between call sites is what this file exists to prevent.
- Reproduction: call `captureFor(v, rev, gen, doc)` and observe that it compiles, with the wrong values reaching `capture`.

**C3 (Low, lead).** `fakeReq.ts:15-18`
- `headersWith.get` matches only the lowercase key `'content-length'`. Real `Headers` are case-insensitive.
- A guard that reads `Content-Length` would see the header as absent in these specs, so its tests could pass for the wrong reason.
- Whether this matters depends on guard code outside the range.

**C4 (Low, lead).** `fakeReq.ts:38-45`
- `statusOf` returns `undefined` both when `run` resolves and when it throws an error with no `status`.
- A spec that uses `toBeUndefined()` to mean "rejected" would pass on a plain `Error`.
- Reproduction: `statusOf(() => { throw new Error('x') })` resolves to `undefined`.

## Unresolved questions

1. **`recoveryRow` (`66-73`)** does not filter `retired_at IS NULL` and returns `[0]`. The `generation` column suggests a (user, version) pair may have several rows. Whether the schema enforces uniqueness is outside the range, so this is a lead.
2. **`retireDirectly`** (`86-101`) is said to mirror `retire()`'s SET list. I did not check that against `kernel.ts`.
3. **`fieldTree.ts:37`** compares `label` with `===`. A localized label object would make the lookup throw. That fails loudly, so it is low priority.
4. **Baseline match:** I did not confirm the supplied text against `6e75a173`.

**Verdict:** Partial assessment of the four supplied ranges, with full reads. No product-code candidates. Four Low test-integrity items, two of them confirmed by local reasoning. Behaviour of the kernel, the schema and the callers is unassessed.
