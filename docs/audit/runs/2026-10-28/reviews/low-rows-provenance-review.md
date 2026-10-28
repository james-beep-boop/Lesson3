# Haiku bounded review — malformed rows and provenance drift

**Limits:** No tools were used. Everything below rests on the excerpts in this context. The runtime results (five 500s, unchanged snapshots, PATCH blocked, Root's four-file byte match) are Sol's and Root's reports and were not re-observed. The P025 text is not in this context, so I've treated F-C31-002 as the P025 lead. If P025 is a separate record, send its text and I'll recheck it.

| ID | Verdict | Severity | Scope |
|---|---|---|---|
| F-C31-002 | Retain, amend wording | Low | Scoped-teacher POST save-as-new; `[null]` elements in five submitted row arrays |
| F-C71-003 | Retain, amend wording | Low | `docs/EXTERNAL-DEPENDENCIES.md` pin and file list; licence count nit as sub-item (Info) |

## A. F-C31-002: retain, Low

**Source support (`app/src/hooks/fieldSplit.ts`):**
- `submittedRows` (80–84) returns any real array unchanged. It validates the container only, not the elements.
- `idsOf` (46) reads `r.id` with no guard. `null.id` throws a TypeError before any reject path runs.
- The throw sites are reached before any write:
  - `lessons` at 262, via `idsOf(submittedLessons)`.
  - `framework` at 266–270. The `lesson.id` read at 267 throws on a null lesson, and 270 throws on a null framework element.
  - `sections`, `rubric` and `summaryTable.lessons` via `guardRows` at 284.
- Because the hook throws before writing, the write is never reached. This is fail-closed, which matches the reported unchanged snapshots and absence of new rows.

**Why Low:** This is an error-contract defect, not an authorization or integrity breach. The guard refuses by exception and no write path is reached. The cost is a 500 where a controlled refusal is expected, plus log noise. The reported 500s match the same `.map`-on-odd-shape class the comment at 64–67 records as fixed on 2026-07-31.

**Amendments:**
- The controlled refusal the guard already uses is `Forbidden` (403). Confirm the status mapping in the `Forbidden` class before quoting a code.
- The 500 class looks limited to JSON `null` elements. `(1).id` is `undefined` and does not throw. Non-null primitives would reach a sequence comparison and should be refused, not thrown. That depends on `sameSequence` (line 105+), which is not in the excerpt, so treat it as inference and do not claim it as tested.
- Keep the reproduction as POST save-as-new only. Do not use PATCH.
- Normal UI does not emit `null` elements. The finding stays scoped to malformed or direct-client input.

## B. F-C71-003: retain, Low

**What the docs say versus the source of truth:**
- `EXTERNAL-DEPENDENCIES.md:73–77` labels the library pin as **Current** and gives `a546ee3`. Line 84 repeats it.
- `EXTERNAL-DEPENDENCIES.md:81` and `:86` say **three** libraries and list `build_docs.js`, `sections.js` and `docx_kit.js`. That omits `attribution.js`.
- `PROVENANCE.md:3`, `:11` and the table at `:55` give **four** files at `f83db61`.
- `PROVENANCE.md:28` gives the separate attribution config pin `d3d2b87`, which `EXTERNAL-DEPENDENCIES` does not mention.
- `EXTERNAL-DEPENDENCIES.md:91–92` tells the re-syncer to use "current pins from PROVENANCE". The doc therefore states a stale pin and also points away from it.
- `:75–76` describes what the pin "retains" but does not mention `f83db61`'s table-layout change.

**Why Low, not Info:** This is a living integration summary, not dated history. Its "Current" labels are wrong on pin, file count and file list, and it omits a pin. A re-sync built from its values would target the wrong revision and miss `attribution.js` and the config. It is not a licence failure or product corruption. The pristine-file hashes are enforced by `vendorProvenance.spec.ts` according to `PROVENANCE.md:58–59`. I have not seen that spec.

**Sub-item (Info):** `PROVENANCE.md:46` says "three byte-pristine files". The table at `:50–56` lists four. Count-only nit, and it does not change the verdict.

**Not verified:** Root's four-byte match, and the existence of the `LICENSE` file that `PROVENANCE.md` says is copied into the directory. Old dated dependency-review reports were not in this context and are not flagged.

**Noticed, out of scope:** `fieldSplit.ts:66` reads "no a teacher with editing access", which is garbled. Info only.

Coordinator: retain both Low findings with the stated narrow scopes. This fresh-context recheck used excerpts and runtime summaries, not execution. The original full P025 report was not in its packet; that context limitation is preserved. Native null-element results and unchanged-row checks are the coordinator's actual evidence. No blanket claim about other primitives, PATCH or licence failure is accepted.
