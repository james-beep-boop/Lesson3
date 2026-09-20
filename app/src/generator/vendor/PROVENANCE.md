# Vendored ARES generator — provenance

The three files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Pinned commit:** `a546ee368b04c24f9a619d49142bf08e6869b890`
- **Vendored:** 2026-09-19
- **Reason:** retain the definitive ARES 1.0.0 layout/resource behavior while adopting upstream's
  grade-label correction. Final Explanation and Summary Table now derive their grade from required
  `META.grade` instead of hardcoding Grade 10, and fail clearly when that metadata is absent.
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
| `lib/build_docs.js` | `generators/lib/build_docs.js` | `244c6248b84c336aaee500608685806b30e1438aafd126bf8173dc1c6e486d5c` |
| `lib/sections.js` | `generators/lib/sections.js` | `5ceef695daeac38ffcfdccf545213544e28ec729b6e718be01634a3c9c210d03` |
| `lib/docx_kit.js` | `generators/lib/docx_kit.js` | `ba74ef7036a06f02a7b6966a90d53350d3f751aacd7adfe96851991f93d73679` |

## Lesson3-owned resource bridge

Upstream `generators/aresResources.js` invokes a Python recommender backed by SQLite. It is not
vendored. A Lesson3-owned CommonJS module at `vendor/aresResources.js` occupies the fixed require
location used by pristine `sections.js` and supplies the already-resolved `LESSONS[].resourceLinks`
stored in Payload.

The bridge is pure Node and uses `AsyncLocalStorage` to isolate each build's lesson-resource queue.
It reproduces upstream safe-input paragraph/link formatting, filters hyperlink targets to `http` and
`https`, and never invokes Python, a subprocess, the recommender, or SQLite. Unlike the former blank
shim, resource output is included in both semantic and package/XML fidelity checks.

`vendor/aresResources.js` and `vendor/package.json` are Lesson3-owned integration files. The latter
marks the directory as CommonJS so the ESM application can load the pristine sources via
`createRequire`.

## Re-sync procedure

From the Lesson3 repository root:

```sh
scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> <commit-sha>
```

Then update this record and run, from `app/`:

```sh
npx tsx scripts/fidelity-spike.ts
npx tsx scripts/adapter-fidelity.ts
```

Also bump `GENERATOR_RENDER_VERSION` when output can change so cached DOCX, PDF, and HTML previews
cannot serve bytes from the previous renderer.
