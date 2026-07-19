/**
 * Definitive ARES 1.0.0 lesson-resource contract.
 *
 * Raw JSON is checked by `ares-contract.schema.json`; this module applies the same invariant to the
 * native Payload representation, where an optional `group` may come back as an object whose leaves
 * are all null. `toAresResourceLinks` restores those empty groups to the explicit JSON `null` used by
 * ARES, while preserving every populated field exactly.
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

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

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

/** Validate the native/stored representation. Empty Payload groups are invalid at lesson level. */
export function validateResourceLinks(value: unknown, path = 'resourceLinks'): string[] {
  const problems: string[] = []
  if (!isObject(value)) return [`${path}: required resourceLinks map is missing.`]

  for (const key of unexpectedKeys(value, RESOURCE_PHASE_KEYS)) {
    problems.push(`${path}.${key}: unexpected phase bucket.`)
  }

  for (const phase of RESOURCE_PHASE_KEYS) {
    const phaseValue = value[phase]
    const phasePath = `${path}.${phase}`
    if (!isObject(phaseValue)) {
      problems.push(`${phasePath}: required phase resource group is missing.`)
      continue
    }
    for (const key of unexpectedKeys(phaseValue, ['video', 'reading', 'fallback_search_url'])) {
      problems.push(`${phasePath}.${key}: unexpected phase resource field.`)
    }
    validateResourceRecord(phaseValue.video, `${phasePath}.video`, problems)
    validateResourceRecord(phaseValue.reading, `${phasePath}.reading`, problems)
    if (!isSafeHttpUrl(phaseValue.fallback_search_url)) {
      problems.push(`${phasePath}.fallback_search_url: must be an http:// or https:// URL.`)
    }
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

/** Convert a validated Payload resource group back to the exact ARES JSON shape. */
export function toAresResourceLinks(value: unknown): AresResourceLinks {
  const links = value as Record<ResourcePhaseKey, Record<string, unknown>>
  return Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((phase) => {
      const item = links[phase]
      if (!isObject(item)) {
        // Unreachable for validated/stored data (all five buckets are required and present); fail
        // with a named path instead of a cryptic property-access error if that ever changes.
        throw new Error(`resourceLinks.${phase}: missing phase bucket during generation.`)
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
