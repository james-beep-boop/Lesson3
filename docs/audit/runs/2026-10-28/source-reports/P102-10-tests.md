# P102-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope and coverage**

Read as supplied, no tool calls:
- `app/tests/e2e/advancedTools.e2e.spec.ts:1-145`: fully read.
- `app/tests/e2e/catalogue.e2e.spec.ts:1-100`: fully read.
- `app/tests/e2e/combine.e2e.spec.ts:1-400`: read to line 400, which ends mid-test. **Lines 401 onward: not assessed.**

Not assessed: the source baseline `6e75a173` (not verified), the helpers (`setupRoleFixture`, `minimalBundleContent`, `setAdvancedTools`, `loginAs`, `recoveryRow`, `editRecoveryUi`, `MARK`), the Combine engine, save/recovery endpoints, catalogue page, and callers. The policy excerpt is also cut off mid-§8, so I used only its explicit Combine, catalogue and role statements. Nothing below claims runtime behaviour was checked.

**Purpose and invariants (as stated in the specs)**
- Standard vs Advanced tools: Advanced shows More ▾, Show details and Download as JSON, never Email without email setup; Standard hides them but keeps Insert link. Switching modes does not change drafts.
- Catalogue: row heading and lesson count; `canEdit` is shown only to editing-access holders; a favourite on a non-Official version renders a pinned row.
- Combine: requires editing access and two versions; result is Not Official; parents are not deleted; Official pointer unchanged; lineage `sourceVersion`/`mergedFrom`; recovery and deleted-parent messages; 640px wider-screen message (matches policy).

**Candidates**

No confirmed product defect. All items below are test-level or uncertain.

1. **Lead, medium (uncertain).** `combine.e2e.spec.ts:331-345`. Pair `a` (`source: null`) vs `different` (`extraPhase`, default source). Lines 332-338 treat a pair with no common ancestor as "No usable common version". This pair also shares no ancestor, yet 342-343 expects the structure message. Either the engine checks structure first, or one assertion targets the wrong precondition. Repro: assert the message for `(a, different)` and for a pair with a shared ancestor plus an extra phase, separately. Severity depends on the engine's precedence, which I cannot see.

2. **Lead, low.** `combine.e2e.spec.ts:162-191`. The test expects `sourceVersion` = `b` for the engine-selected base. The supplied policy does not state the base-selection rule, so I cannot say whether this is correct. Unresolved.

3. **Test hygiene, low.** `catalogue.e2e.spec.ts:72-80` spreads `...minimalBundleContent()` last, unlike `combine.e2e.spec.ts:44-63` which spreads it first. If the helper returns `title`, `semver`, or `subjectGrade`, the pinned version's semver/title change. Checking the helper would settle it. Likely fails loudly (line 91), not silently.

4. **Test isolation, low.** `catalogue.e2e.spec.ts:72-87` adds a pinned version to the describe-level fixture. Tests 1-2 (lines 52, 65) assert exactly one `.substrand-row` matching `ROW_NAME`, and the pinned row also matches it (line 94). If tests run in a different order, repeat, or the fixture is reused, tests 1-2 fail. Not a product defect.

5. **Test hygiene, low.** `combine.e2e.spec.ts:131-133` registers a dialog listener that throws and never removes it. Throwing inside a listener does not reliably fail the test. Once a listener is attached, Playwright does not auto-dismiss dialogs, so an unexpected dialog would likely hang until timeout rather than produce the intended message.

**Unresolved questions**
- What is the engine's precedence between "no common version" and "unreliable structure" (Lead 1)?
- What rule selects the base version (Lead 2)? Policy excerpt does not say.
- Does `minimalBundleContent()` return any keys that overlap with the fields set in the catalogue create (Lead 3)?
- Lines 401-end of `combine.e2e.spec.ts` (the restored-comparison retry test) are not assessed.
