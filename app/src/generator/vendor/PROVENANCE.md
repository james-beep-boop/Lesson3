# Vendored ARES generator — provenance

The three files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Pinned commit:** `742c8a96637377abbec37af32073210b9f87465b`
- **Vendored:** 2026-07-19
- **Reason:** definitive ARES 1.0.0 JSON/resource-link cutover; this pin supplies the current
  five-column Section C layout, inline resource rendering, and page-break behavior.
- **Mirror tag:** none created for this local change. Create one only as a separately approved
  upstream-repository operation.

## Pristine files

| Lesson3 path | Upstream path | SHA-256 |
| --- | --- | --- |
| `lib/build_docs.js` | `generators/lib/build_docs.js` | `291d62483be608989a8256b428e8d5215dd4ad1d242e0d8a5bdfb428ed5061b1` |
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
