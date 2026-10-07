# Vendored ARES generator — provenance

The four files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Pinned commit:** `65911461bd2fb0b34e61a4e07786dc47680c3840` (`6591146`, upstream HEAD on 2026-10-06)
- **Vendored:** 2026-10-07
- **Reason:** adopt upstream's 2026-09-30 → 2026-10-04 generator changes: (1) a **student** Final
  Explanation (prompts, blank answer space, rubric) and a separate **teacher key** (prompts beside the
  exemplar answers) — previously one document titled "Student Assessment Document" printed the
  exemplars; (2) the CC BY-NC 4.0 attribution block and per-lesson footer (`lib/attribution.js`, new);
  (3) Markdown tables inside Final Explanation text rendered as real tables; (4) link-selection v2's
  resource seam (`DB_PATH`, `takeDiagnostics`) and its null-slot wording. The lib files have not changed
  upstream since `69f3583` (2026-10-04); nothing under `generators/` or `config/attribution.yaml` changed
  between `9f2f25b` and this pin. **Previous pin:** `a546ee3` (2026-09-19).
- **Mirror tag:** none created for this local change. Create one only as a separately approved
  upstream-repository operation.

## Licence — MIT, resolved 2026-09-19

The upstream `markknit/cbe-generation-system` repository adopted the MIT License in commit
`15283e42a49975a0c6e56dbca088e7588ba0c078` on 2026-09-20 UTC, with copyright `2026 markknit`.
GitHub identifies the repository license as SPDX `MIT`.

The upstream license is copied verbatim into this directory as `LICENSE`; retain it with these
vendored files. Lesson3's root `LICENSE` covers Lesson3-authored code under the same license but a
different copyright notice. Matching license terms close the prior redistribution and compatibility
gap without changing the authorship or provenance of the three byte-pristine files.

## Pristine files

| Lesson3 path | Upstream path | SHA-256 |
| --- | --- | --- |
| `lib/build_docs.js` | `generators/lib/build_docs.js` | `4c571632c38d83137d416c4c34638ad7caebd0dae235af6b6509788cb195d1d7` |
| `lib/sections.js` | `generators/lib/sections.js` | `decfb1a33f46c4db0f008f19095e8bf28568e8864fedaceae4a713c5fc57a013` |
| `lib/docx_kit.js` | `generators/lib/docx_kit.js` | `ba74ef7036a06f02a7b6966a90d53350d3f751aacd7adfe96851991f93d73679` |
| `lib/attribution.js` | `generators/lib/attribution.js` | `7ac867b861ea1be8f6cfe8590cf7171c94b5536cc828c4d29983bd6abe6f9288` |
| `vendor/config/attribution.upstream.yaml` | `config/attribution.yaml` | `950f68dbceee79d12de4dc49e9b5827434dca5fb81ddf4bfd188c173041f4104` |

`tests/unit/vendorProvenance.spec.ts` recomputes these hashes from the files on disk, so this table cannot
silently drift from the vendored bytes.

## Attribution config — the one deliberate deviation

`lib/attribution.js` reads `config/attribution.yaml` (by default relative to itself: `generator/config/`; in the
production bundle that default does not resolve, so `generator/index.ts` sets `ATTRIBUTION_YAML` explicitly). Upstream's
file says `year: auto`, which stamps the **render-time** year: the same immutable snapshot re-rendered in
January would change bytes, contradicting the byte-stability contract in `renderVersion.ts`.

Lesson3 therefore ships `generator/config/attribution.yaml` (SHA-256
`4203befb96b6a9a0546f5cf79a4080b23252e5389fda5c124b560ab82b30b183`) whose **only** difference from the pristine
copy is `year: 2026` — the **configured copyright year for this generator release**. It is not a claim about
when any particular lesson was first published, and it says nothing about future lessons. `scripts/
vendor-generator.sh` produces it and aborts unless that is the only changed line. Changing the year later is
a deliberate act that **must accompany a `GENERATOR_RENDER_VERSION` bump**.

Runtime needs: `js-yaml` (now a direct, pinned dependency; bundled into the server chunks) and the yaml file
(listed in `outputFileTracingIncludes`; the `Dockerfile` only proves it shipped). That the running app finds it and
renders attribution is proved over the wire by `tests/http/teacherKey.http.spec.ts`.

## Lesson3-owned resource bridge

Upstream `generators/aresResources.js` invokes a Python recommender backed by SQLite. It is not
vendored. A Lesson3-owned CommonJS module at `vendor/aresResources.js` occupies the fixed require
location used by pristine `sections.js` and `build_docs.js`.

Since link-selection v2, pristine `sections.js` either queries the ARES content database (only when a
file exists at the exported `DB_PATH`) or — its own supported path for "no database on this machine" —
renders each lesson's own `lesson.resourceLinks`. The bridge deliberately selects the second path: it
exports a `DB_PATH` that cannot exist, a `getAllPhaseResources` that throws if ever called, and a no-op
`takeDiagnostics`. That is order-independent and shares no state between concurrent builds; it replaces
the earlier positional `AsyncLocalStorage` queue, which could prove call count but never call order.
Upstream prints one `console.warn` per lesson on this path; that is accepted, because suppressing it
would mean replacing the global `console.warn` under concurrent exports.

The bridge reproduces upstream's safe-input paragraph/link formatting and null-slot wording ("No closely
matching video/reading in the ARES library for this activity", the search link, and the visible
`Search terms:` line), filters hyperlink targets to `http` and `https`, and never invokes Python, a
subprocess, the recommender, or SQLite. It cannot reproduce upstream's partial-match "Related topic"
labels: those come from judge diagnostics that live outside the contract JSON.

`vendor/aresResources.js` and `vendor/package.json` are Lesson3-owned integration files. The latter
marks the directory as CommonJS so the ESM application can load the pristine sources via
`createRequire`.

## Re-sync procedure

From the Lesson3 repository root:

```sh
scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> <commit-sha>
```

The script copies the four lib files and derives the fixed-year attribution config. Re-check upstream's
`sections.js` resource path and `build_docs.js` imports against the bridge before trusting a new pin.

Then update this record and run, from `app/`:

```sh
npx tsx scripts/fidelity-spike.ts
npx tsx scripts/adapter-fidelity.ts
```

Also bump `GENERATOR_RENDER_VERSION` when output can change so cached DOCX, PDF, and HTML previews
cannot serve bytes from the previous renderer.
