/**
 * Definitive ARES 1.0.0 lesson-resource contract.
 *
 * Raw JSON is checked by `ares-contract.schema.json`; this module applies the same invariant to the
 * native Payload representation. The external contract is an object keyed by phase; storage uses
 * five native child-array rows so Payload/Postgres never flattens all 95 resource leaves into one
 * lesson row (PostgreSQL functions accept at most 100 arguments). `toAresResourceLinks` restores
 * those rows and empty optional groups to the exact ARES JSON shape.
 */

export const RESOURCE_PHASE_KEYS = ['predict', 'observe', 'explain', 'dqb', 'model'] as const
export type ResourcePhaseKey = (typeof RESOURCE_PHASE_KEYS)[number]

export const RESOURCE_RECORD_KEYS = [
  'title',
  'source',
  'content_type',
  'direct_url',
  'search_url',
  'search_terms',
  'exact_search_url',
  'has_transcript',
  'tier',
] as const

export interface AresResourceRecord {
  title: string
  source: string
  content_type: string
  direct_url: string
  search_url: string
  search_terms: string
  exact_search_url: string
  has_transcript: boolean
  tier: number
}

export interface AresPhaseResources {
  video: AresResourceRecord | null
  reading: AresResourceRecord | null
  fallback_search_url: string
}

export type AresResourceLinks = Record<ResourcePhaseKey, AresPhaseResources>

export interface StoredResourceLinkRow extends AresPhaseResources {
  phase: ResourcePhaseKey
  id?: string | null
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const isResourcePhaseKey = (value: unknown): value is ResourcePhaseKey =>
  RESOURCE_PHASE_KEYS.includes(value as ResourcePhaseKey)

// The ingest safe-URL gate (boolean predicate). The generator bridge keeps a semantically identical
// CommonJS copy (`safeHttpUrl` in generator/vendor/aresResources.js) as a render-time re-check —
// the two must agree on what counts as a safe hyperlink; keep them in step.
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const unexpectedKeys = (value: Record<string, unknown>, allowed: readonly string[]): string[] =>
  Object.keys(value).filter((key) => !allowed.includes(key))

function validateResourceRecord(value: unknown, path: string, problems: string[]): void {
  if (value === null) return
  if (!isObject(value)) {
    problems.push(`${path}: expected a resource object or null.`)
    return
  }

  for (const key of unexpectedKeys(value, RESOURCE_RECORD_KEYS)) {
    problems.push(`${path}.${key}: unexpected resource field.`)
  }

  for (const key of ['title', 'source', 'content_type', 'search_terms'] as const) {
    if (typeof value[key] !== 'string') problems.push(`${path}.${key}: required string missing.`)
  }
  for (const key of ['direct_url', 'search_url', 'exact_search_url'] as const) {
    if (!isSafeHttpUrl(value[key])) problems.push(`${path}.${key}: must be an http:// or https:// URL.`)
  }
  if (typeof value.has_transcript !== 'boolean') {
    problems.push(`${path}.has_transcript: required boolean missing.`)
  }
  if (!Number.isInteger(value.tier) || (value.tier as number) < 0) {
    problems.push(`${path}.tier: must be a non-negative integer.`)
  }
}

/** The stored row's allowed keys (`id` is Payload's row id). Pinned to the field definition in
 *  `fields/lessonContent.ts` by `tests/unit/resourceRowDrift.spec.ts`. */
export const STORED_ROW_KEYS = ['id', 'phase', 'video', 'reading', 'fallback_search_url'] as const

/** Convert the definitive external map to Payload's five native child rows. Invalid non-object
 * input is returned unchanged so the shared generatable gate can report it during pre-flight. */
export function aresResourceLinksToRows(value: AresResourceLinks): StoredResourceLinkRow[]
export function aresResourceLinksToRows(value: unknown): unknown
export function aresResourceLinksToRows(value: unknown): unknown {
  if (!isObject(value)) return value
  return RESOURCE_PHASE_KEYS.map((phase) => {
    const phaseValue = value[phase]
    // The enclosing object key is authoritative. Assign it after the raw bucket so an unexpected
    // nested `phase` property cannot redirect or duplicate a stored row before contract drift is
    // reported against the raw JSON.
    return isObject(phaseValue) ? { ...phaseValue, phase } : { phase }
  })
}

/** Validate the native/stored five-row representation. Empty Payload groups are invalid. */
export function validateResourceLinks(value: unknown, path = 'resourceLinks'): string[] {
  const problems: string[] = []
  if (!Array.isArray(value)) return [`${path}: required resourceLinks rows are missing.`]
  if (value.length !== RESOURCE_PHASE_KEYS.length) {
    problems.push(
      `${path}: expected exactly ${RESOURCE_PHASE_KEYS.length} phase rows; found ${value.length}.`,
    )
  }

  const seen = new Set<ResourcePhaseKey>()
  value.forEach((phaseValue, index) => {
    const rowPath = `${path}[${index}]`
    if (!isObject(phaseValue)) {
      problems.push(`${rowPath}: expected a phase resource row.`)
      return
    }
    for (const key of unexpectedKeys(phaseValue, STORED_ROW_KEYS)) {
      problems.push(`${rowPath}.${key}: unexpected phase resource field.`)
    }
    const phase = phaseValue.phase
    if (!isResourcePhaseKey(phase)) {
      problems.push(`${rowPath}.phase: invalid resource phase ${JSON.stringify(phase)}.`)
      return
    }
    if (seen.has(phase)) {
      problems.push(`${rowPath}.phase: duplicate resource phase ${JSON.stringify(phase)}.`)
      return
    }
    seen.add(phase)
    const phasePath = `${path}.${phase}`
    validateResourceRecord(phaseValue.video, `${phasePath}.video`, problems)
    validateResourceRecord(phaseValue.reading, `${phasePath}.reading`, problems)
    if (!isSafeHttpUrl(phaseValue.fallback_search_url)) {
      problems.push(`${phasePath}.fallback_search_url: must be an http:// or https:// URL.`)
    }
  })
  for (const phase of RESOURCE_PHASE_KEYS) {
    if (!seen.has(phase)) problems.push(`${path}.${phase}: required phase resource row is missing.`)
  }
  return problems
}

/** Payload expands a null optional group into nullable leaves; detect that representation. Derived
 *  from `RESOURCE_RECORD_KEYS` so it can't drift from the field set. `has_transcript` (a checkbox
 *  defaulting to false) is the one field excluded — it never distinguishes empty from populated. */
function recordIsEmpty(value: Record<string, unknown>): boolean {
  return RESOURCE_RECORD_KEYS.filter((key) => key !== 'has_transcript').every(
    (key) => value[key] == null || value[key] === '',
  )
}

function toResourceRecord(value: unknown): AresResourceRecord | null {
  if (value === null || value === undefined) return null
  if (!isObject(value) || recordIsEmpty(value)) return null
  return Object.fromEntries(
    RESOURCE_RECORD_KEYS.map((key) => [key, value[key]]),
  ) as unknown as AresResourceRecord
}

/** Convert validated Payload resource rows back to the exact ARES JSON shape. */
export function toAresResourceLinks(value: unknown): AresResourceLinks {
  if (!Array.isArray(value)) {
    throw new Error('resourceLinks: missing stored phase rows during generation.')
  }
  const rows = new Map<ResourcePhaseKey, Record<string, unknown>>()
  for (const item of value) {
    if (!isObject(item) || !isResourcePhaseKey(item.phase)) continue
    rows.set(item.phase, item)
  }
  return Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((phase) => {
      const item = rows.get(phase)
      if (!isObject(item)) {
        // Unreachable for validated/stored data (all five rows are required and present); fail
        // with a named path instead of a cryptic property-access error if that ever changes.
        throw new Error(`resourceLinks.${phase}: missing phase row during generation.`)
      }
      return [
        phase,
        {
          video: toResourceRecord(item.video),
          reading: toResourceRecord(item.reading),
          fallback_search_url: item.fallback_search_url as string,
        },
      ]
    }),
  ) as AresResourceLinks
}
