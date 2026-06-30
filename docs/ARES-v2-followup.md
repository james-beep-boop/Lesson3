> **✅ RESOLVED in commit `fd476b4`** ("Address partner re-review"). Both items below were fixed
> at the correct target: `schemaVersion: '1.0.0'` now ships in all 42 **JSON exports** (first
> top-level key), and `LESSONS[].summaryTablePrompt.explained` was authored for Physics SS3.4/L8
> and SS4.2/L7 with their DOCX regenerated. Full re-run: **42/42 clean — 0 blockers, 0 contract
> drift, 0 missing fields.** The history below is retained for the record.

---

## Re-review of the updated v2 data (commit `3b75018`) — 2 of 4 fixed, 2 still open

Thanks for the remediation summary — re-ran all 42 `data/outputs/v2/**/*_data.json` through the
same checks (parse → contract → generator-completeness) against commit `3b75018`, and confirmed
against the generator (`generators/lib/sections.js` / `docx_kit.js`, unchanged).

### ✅ Confirmed fixed (both blockers)

- **`framework[].phase` vocabulary** — **1,920 / 1,920 phases now canonical** (was 75%
  off-vocabulary), evenly distributed (~384 each across the five phases). The committed DOCX was
  **regenerated**: `Biology/SS1.1_Cell_Structure/...CBE_LessonSequence.docx` now renders **60/60
  phase cells correctly colour-coded, zero grey** (previously 45 grey). Matches your spot-check.
- **`safety<N>otes` key corruption** — **0 remaining** across the corpus (was 95 lessons in
  39 files). All now emit `safetyNotes`.

This clears the hard gate: **0 / 42 files now fail** (was 42 / 42). The corpus is ingestable.

And thanks for the **DQB rationale** (finding 1a) — keeping the five-value vocabulary and
collapsing all DQB visits (Creation/Update/Closure/…) to "Driving Question Board (DQB) Creation"
because every visit is the same activity type under the NGSS storyline model. That's the right
call and it closes the one item that needed a human decision — no generator/SCHEMA change needed.

### ⚠️ Still open — and both come down to a precise mismatch between what was checked and what we check

Your summary marks findings 3 and 4 as resolved, but they were verified against the wrong target
in each case. Both still fail when checked against the **JSON exports** (the artifact your own
"Suggested next step" says to validate, and the artifact we ingest).

**3. `schemaVersion` — fixed in the `.js` source, but NOT in the JSON exports.**
- ✅ `generators/data/bio_1_1_data.js` now has `const schemaVersion = '1.0.0'` and exports it
  (lines 918–920). Same for the other v2 source modules — your fix to the source is correct.
- ❌ But every JSON file under `data/outputs/v2/` still reads **`schemaVersion: null/absent`**.
  Spot-checked the Biology SS1.1 export and all 42 — none carry it.
- **Root cause:** your verification table checked `generators/data/` (the `.js` source, "42
  files declaring schemaVersion"), never the JSON. The **export step that emits the `.json` from
  the `.js` is dropping the top-level `schemaVersion`** — it's serialising only
  `META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE`.
- **Fix:** update the JSON-export script to include the top-level `schemaVersion`, then
  re-emit the 42 JSON files. (No source change needed — the `.js` is already correct.)

**4. The `explained` you verified is a different field from the one that's missing.**
- ✅ You checked `SUMMARY_TABLE.lessons[].explained` — and that is complete (0 missing in
  phys_3_4 and phys_4_2). Confirmed.
- ❌ But the missing field is `LESSONS[].summaryTablePrompt.explained` — a **different object**
  (the per-lesson summary block, not the document-level SUMMARY_TABLE group). There are two
  `explained` fields in the bundle; the one that was never broken is the one that got verified.
- Still missing on exactly:
  - `Physics/SS3.4_Electrostatics/...` — **lesson 8** ("How Much Energy Can a Capacitor Store?")
  - `Physics/SS4.2_Introduction_to_Space_Physics/...` — **lesson 7** ("Telescopes: Windows to the Universe")
- Both lessons have `summaryTablePrompt.observed` and `.learned` but no `.explained` (the
  contract requires all three). Effect in the generator: `sections.js:216` does
  `cell(lesson.summaryTablePrompt.explained, …)` → with the field absent it passes `undefined`,
  which **does not crash** (the docx Packer tolerates it) but renders the **"How does this
  explain the phenomenon?" cell blank** in that lesson's summary block.
- **Fix:** author `summaryTablePrompt.explained` for those two lessons and regenerate their DOCX.

### Summary

| Item | Your status | Verified against JSON exports |
|---|---|---|
| `framework[].phase` off-vocabulary | Fixed | ✅ fixed (1920/1920 canonical; DOCX regenerated) |
| `safety<N>otes` key corruption | Fixed | ✅ fixed (0 remaining) |
| `schemaVersion` missing | Fixed (38+4) | ⚠️ in `.js` source only — **absent from all 42 JSON exports** (export script drops it) |
| `summaryTablePrompt.explained` missing | Already resolved | ⚠️ still missing — verification checked `SUMMARY_TABLE.lessons[].explained`, but the gap is `LESSONS[].summaryTablePrompt.explained` (SS3.4/L8, SS4.2/L7) |

Neither open item blocks ingestion or generation — they're a contract-completeness gap in the
JSON and one blank cell in two documents. Both have a deterministic fix above. Once the export
script carries `schemaVersion` and the two `summaryTablePrompt.explained` strings are authored,
all 42 JSON exports conform fully to the published contract.
