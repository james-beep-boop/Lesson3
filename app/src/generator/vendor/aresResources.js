/**
 * Lesson3-authored shim — NOT vendored ARES code, NOT pristine.
 *
 * Pristine `sections.js` does `require('../aresResources')` to populate the
 * LessonSequence Resource column. The real ARES module shells out to a Python
 * recommender + SQLite, which violates Lesson3's single-runtime rule, so it is
 * intentionally NOT vendored (see vendor/PROVENANCE.md, docs/DECISIONS.md).
 * Resources are DEFERRED.
 *
 * Without this file, `sections.js`'s try/catch falls back to printing
 * "(ARES resources unavailable)" in every Resource cell. This shim replaces that
 * placeholder with a BLANK cell (a single empty paragraph): the column stays in the
 * table — preserving the approved-DOCX structure — but renders empty, matching the
 * DEFERRED decision. Pure Node, no Python, deterministic.
 *
 * Lives at vendor/aresResources.js (the fixed require path, sibling of lib/). The
 * vendor re-sync (scripts/vendor-generator.sh) copies only the three lib files and
 * never touches this shim, so it survives a generator re-pin.
 */
const { para } = require('./lib/docx_kit')

// No content index → no per-phase resources to look up.
function getAllPhaseResources() {
  return {}
}

// Blank cell: one empty paragraph (valid OOXML; no placeholder text).
function buildResourceParagraphs() {
  return [para('')]
}

module.exports = { getAllPhaseResources, buildResourceParagraphs }
