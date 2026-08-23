/**
 * THE mammoth-output shapes the generator's tables render to, as probed against the real
 * generator → mammoth chain on 2026-08-23.
 *
 * ⚑ ONE ENCODING OF ONE FACT. `compareGroups.spec.ts` and `compareDiffGroups.spec.ts` both build
 * these fixtures, and both exist to fail loudly if a generator or mammoth bump moves the markup.
 * Two copies defeat that: a bump can be "fixed" in one file and left stale in the other, silently
 * weakening the drift guard. They had already diverged — one wrapped every cell in `<p>` and the
 * other did not, while both claimed to be the probed truth.
 *
 * Cells take RAW HTML so a caller can put whatever a real cell holds inside them; `paraRow` is the
 * common case (mammoth wraps cell text in a paragraph).
 */

/** A generator `fullHeader` row: one full-width cell holding a bold paragraph. */
export const headerRow = (text: string, span = 2): string =>
  `<tr><td colspan="${span}"><p><strong>${text}</strong></p></td></tr>`

/** A row whose cells are given as raw HTML. */
export const cellRow = (...cells: string[]): string =>
  `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`

/** A row of plain text cells, each wrapped in a paragraph as mammoth emits them. */
export const paraRow = (...texts: string[]): string => cellRow(...texts.map((t) => `<p>${t}</p>`))

/** Mammoth always emits an explicit `<tbody>`. */
export const table = (...rows: string[]): string => `<table><tbody>${rows.join('')}</tbody></table>`
