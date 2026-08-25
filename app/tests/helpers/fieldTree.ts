/**
 * Walking a Payload field config as plain data, for the specs that assert on SHAPE rather than behaviour.
 *
 * ⚑ Extracted 2026-08-25, when the plan-details collapsible gave two specs the same job and both
 * hand-rolled it. The duplication that mattered was not the type alias — it was
 * `fields.find((f) => f.type === 'collapsible')`, written in `planDetailsPanel.spec.ts` and
 * `editorPlainLanguage.spec.ts`: add a SECOND collapsible to the collection and both silently
 * repoint at whichever comes first, including the one whose `throw new Error('Missing …')` would
 * then never fire. `planDetailsPanel` below finds it BY LABEL, so a second panel is a named failure
 * rather than a coin toss.
 *
 * Same trajectory `payloadErrors.ts` and `fakeReq.ts` record in their own headers: the second caller
 * is when it moves. ⚑ `byName` is deliberately NOT here yet — three specs (`resourceRowDrift`,
 * `proseWhitelistDrift`, `editorPlainLanguage`) each have a copy plus a `childrenOf` sibling, and
 * consolidating those is a wider change than this one; it belongs to whoever next touches them.
 *
 * Dependency-free on purpose, so the DB-free `test:unit` config can import it.
 */

/** A Payload field seen as data. Config objects are unions with ~20 members; specs want four keys. */
export type LooseField = {
  name?: string
  type?: string
  label?: unknown
  admin?: Record<string, unknown>
  fields?: LooseField[]
}

/**
 * The version editor's administrator-only panel, found by its LABEL.
 *
 * Throws rather than returning undefined: "the panel is gone" is a legible failure, where a silent
 * `undefined` turns into a confusing property-of-undefined two assertions later.
 */
export const planDetailsPanel = (fields: LooseField[]): LooseField => {
  const panels = fields.filter((field) => field.type === 'collapsible')
  const panel = panels.find((field) => field.label === 'Plan and sub-strand details')
  if (!panel) {
    const seen = panels.map((p) => String(p.label)).join(', ') || '(no collapsible fields at all)'
    throw new Error(`Missing the "Plan and sub-strand details" panel. Collapsibles found: ${seen}`)
  }
  return panel
}
