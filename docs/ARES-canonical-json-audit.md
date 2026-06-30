# ARES `canonical_json/` audit & reorganization (2026-06-30)

Audit of the locally-collected ARES JSON corpus at
`cbe-generation-system/data/canonical_json/` — "every JSON produced so far" — for consistency,
format errors, and ingestability into the Lesson3 lesson-plan repository. Evaluated with Lesson3's
own ingest checkers (`extractAresJson` → `rawToBundle` → `validateGeneratable` + `contractDrift`)
plus bundle-key collision detection.

## Result in one line

Of **73 files**, only **42 are ingestable** — exactly the `schemaVersion: 1.0.0` set, which is
**byte-identical (42/42) to the validated v2 corpus on GitHub (commit `fd476b4`)**. The other 31
are legacy duplicates, renumbering conflicts, or partial dumps. The directory was reorganized so
the 42 canonical files stay in the root and the 31 others are filed into typed subdirectories.

## Why the other 31 can't be ingested

Lesson3's stable bundle key is **`subject + grade + substrand_id`**, unique, one official version
per bundle. The non-canonical files break that three ways:

- **16 bundle-key collisions** — the same `(subject, grade, substrand_id)` claimed by 2–4 files.
- **7 files with no `substrand_id`** — cannot form a key at all (`META.substrand_id` is null).
- **2 files that aren't bundles** — bare JSON arrays (a `LESSONS` list with no `META/UNIT/…`
  wrapper); `extractAresJson` rejects them.

The collisions are not just renamed copies — many assign a **different topic** to the same slot,
a residue of an old→new sub-strand renumbering (e.g. Maths 2.2/2.3/2.4 were Reflection &
Congruence / Rotation / Trigonometry in the old scheme; canonical reassigned them to Area &
Volume topics and moved the originals to 1.4 / 3.2 / 3.1).

## Discriminator

**`schemaVersion` present ⇒ canonical and ingestable. Absent ⇒ legacy, skip.** This single
top-level field cleanly separates the 42 keepers from the 31 others.

## Reorganization applied

Root now holds the 42 canonical files (all `schemaVersion 1.0.0`, 42 unique bundle keys, 0
contract drift, 0 generator blockers). The 31 others were moved into:

| Subdirectory | Files | Meaning |
|---|---|---|
| `Possible_dupes/` | 3 | Byte-identical redundant copies (the Biology 1.4 "Chemicals of Life" trio, incl. the truncated `__icals_of_life.json`). |
| `Semantic_conflicts/` | 7 | `substrand_id` reassigned to a **different topic** in canonical — Biology 1.1 (Intro vs Cell Structure), 1.2 (Specimen ×2 vs Chemicals of Life), 1.3 (Cell Structure & Specialisation vs Cell Biology); Maths 2.2 (Reflection & Congruence vs Area of Polygons), 2.3 (Rotation vs Area of Part of a Circle), 2.4 (Trigonometry vs Surface Area & Volume). |
| `Superseded_same_topic/` | 12 | Same topic as a canonical file but older/lower-fidelity (Biology 2.1–3.3 "X in Plants/Animals" 8-lesson versions superseded by the 10–12-lesson canonical "Plant/Animal X"; Chemistry 1.4 Chemical Bonding 8-lesson vs canonical 13-lesson). |
| `Malformed_no_key/` | 9 | No `substrand_id` (7 bare-numbered Biology/Maths files) or not a bundle object (2 `bio_1_4_checkpoint` JSON-array dumps). |

### Canonical set (kept in root) — 42, complete

- **Biology (9):** 1.1 Cell Structure, 1.2 Chemicals of Life, 1.3 Cell Biology, 2.1 Plant
  Nutrition, 2.2 Plant Transport, 2.3 Plant Gaseous Exchange & Respiration, 3.1 Animal Nutrition,
  3.2 Animal Transport, 3.3 Animal Gaseous Exchange & Respiration.
- **Chemistry (7):** 1.1 Introduction, 1.2 The Atom, 1.3 Periodic Table, 1.4 Chemical Bonding,
  1.5 Periodicity, 2.1 Introduction to Salts, 3.1 Acids and Bases.
- **Mathematics (14):** 1.1 Real Numbers, 1.2 Indices, 1.3 Quadratic Equations, 1.4 Congruence,
  2.1 Similarity & Enlargement, 2.2 Area of Polygons, 2.3 Area of Part of a Circle, 2.4 Surface
  Area & Volume, 3.1 Trigonometry I, 3.2 Rotation, 3.3 Vectors I, 3.4 Linear Motion,
  4.1 Statistics I, 4.2 Probability I.
- **Physics (12):** 1.1 Pressure, 1.2 Mechanical Properties, 1.3 Temperature & Thermal Expansion,
  1.4 Energy/Work/Power/Machines, 1.5 Moments of Equilibrium, 2.1 Properties of Waves,
  3.1 Radioactivity, 3.2 Current Electricity, 3.3 Introduction to Electronics, 3.4 Electrostatics,
  4.1 Greenhouse Effect & Climate Change, 4.2 Introduction to Space Physics.

## Verification

- Root after reorg: **42 `.json`, all `schemaVersion 1.0.0`, 42 unique `(subject, substrand_id)`
  keys, no collisions.** Re-ran the ingest harness: 0 parse failures, 0 generator blockers,
  0 contract drift.
- Subdirectories: `Possible_dupes/` 3, `Semantic_conflicts/` 7, `Superseded_same_topic/` 12,
  `Malformed_no_key/` 9 (= 31 archived).
- File moves were plain `mv` (no git operations); nothing committed. The reorg is reversible.

## Recommendation to ARES

Treat `canonical_json/` as **only the 42 `schemaVersion`-stamped files** going forward. The four
archive subdirectories can be deleted once confirmed unneeded — `Superseded_same_topic/` and
`Semantic_conflicts/` are fully covered by the canonical set; `Possible_dupes/` and
`Malformed_no_key/` carry no unique content. The publish pipeline should ideally write only
schema-stamped bundles into this directory so the legacy mix doesn't re-accumulate.
