# Vendored ARES generator — provenance

These files are **copied byte-verbatim** from the ARES CBE generation system and
**must not be edited**. All Lesson3-specific integration lives one level up in
`app/src/generator/` (e.g. `index.ts`), never inside `vendor/`. Keeping these files
identical to upstream is what makes re-syncing a future version a clean diff.

## Source

- **Repo:** `markknit/cbe-generation-system` (mirrored on `james-beep-boop/cbe-generation-system`)
- **Branch:** `claude/setup-cbe-generation-ZKiIi` (unmerged at time of vendoring)
- **Pinned commit:** `529be408618e6748df5d666dd98d0bfbc6cc1032` (the branch tip as of 2026-06-08)
- **Mirror tag (insurance against the bot branch being force-pushed/deleted):**
  `lesson3-vendor-529be40` on `james-beep-boop/cbe-generation-system`
- **Vendored:** 2026-06-08
- **Note:** initially pinned at `212da91` (then-tip of a stale fork). Re-pinned to the real
  branch tip `529be40`; the four intervening commits touched only docs/content/output DOCX —
  the three vendored lib files are **byte-identical** at both commits (verified), so this
  re-pin is provenance-only with no functional change. Earlier tag `lesson3-vendor-212da91`
  also still points at the equivalent lib bytes.

## Files (each byte-identical to the pinned commit)

| Vendored path        | Upstream path                     |
| -------------------- | --------------------------------- |
| `lib/build_docs.js`  | `generators/lib/build_docs.js`    |
| `lib/sections.js`    | `generators/lib/sections.js`      |
| `lib/docx_kit.js`    | `generators/lib/docx_kit.js`      |

## Intentionally NOT vendored: `aresResources.js`

`generators/aresResources.js` shells out to Python (`execSync('python3' …)`) against a
SQLite DB to populate the Section-C **Resource column**. Lesson3 is **single-runtime
(Node only)** and must **never invoke the Python recommender live** (SPEC §0 / CLAUDE.md).

`sections.js` already treats this module as **optional**: it `try`-requires `../aresResources`
and, when absent, falls back to no-op resource functions (emitting a
`(ARES resources unavailable)` placeholder). By omitting the file we exercise that
documented fallback, guaranteeing **zero Python** and a deterministic (empty) Resource
column. The fidelity diff excludes the Resource column on both sides, so this does not
affect the proof.

## `package.json` marker

`vendor/package.json` declares `{"type":"commonjs"}`. The vendored files are CommonJS,
but the Lesson3 app is `"type":"module"` (ESM); without this marker Node would mis-parse
the `.js` files as ESM. Lesson3 code imports the builders from ESM via `createRequire`.

## Re-syncing a new upstream version

Run `scripts/vendor-generator.sh <path-to-clone> <commit-sha>` from the repo root, then
**re-run the fidelity regression** (`app/scripts/fidelity-spike.ts`). The regression diff
— not a silent SHA bump — is the acceptance gate for adopting any new generator version.
Update the pinned commit / date above and push a new mirror tag.
