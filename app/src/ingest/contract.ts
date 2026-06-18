/**
 * Contract drift check (SPEC §7 data-contract collaboration with ARES).
 *
 * Validates a RAW ARES data object (the UPPERCASE `META`/`UNIT`/`LESSONS`/`FINAL_EXPLANATION`/
 * `SUMMARY_TABLE` shape, BEFORE `rawToBundle`) against the canonical contract we proposed to
 * ARES — `ares-contract.schema.json`, the single source of truth shared with them and enforced
 * here. It returns a list of human-readable DRIFT messages (`[]` = conforms); ingest reports them
 * NON-BLOCKING for now (current ARES output doesn't conform — that's the drift we're reporting),
 * to be promoted to a hard gate once ARES adopts the contract. See docs/ARES-DATA-REQUEST.md.
 *
 * This is a deliberately small, dependency-free validator covering ONLY the JSON-Schema keywords
 * our own schema uses (type / required / properties / additionalProperties:false / items /
 * minItems / minimum / enum / pattern). We don't pull in a general validator (ajv): the keyword
 * set is fixed and authored by us, the project pins deps deliberately, and a bespoke checker lets
 * us emit ACTIONABLE messages (alias-of / likely-typo hints) instead of generic schema errors.
 * It is matched by a DB-less gate (scripts/contract-check.ts) so the hand-rolled logic is proven.
 */
import schemaJson from './ares-contract.schema.json'

type Schema = {
  type?: string | string[]
  required?: string[]
  properties?: Record<string, Schema>
  additionalProperties?: boolean
  items?: Schema
  minItems?: number
  minimum?: number
  enum?: unknown[]
  pattern?: string
}

const schema = schemaJson as unknown as Schema

/** Non-canonical field names ARES currently emits → the canonical name in the contract. */
const ALIAS_OF: Record<string, string> = {
  duration: 'totalDuration',
  storyline: 'storylineThread',
  subStrandContent: 'content',
  outcomes: 'learningOutcomes',
  competencies: 'coreCompetencies',
  careerConnections: 'careers',
  focusForLessons: 'focus',
  keyInquiryQuestions: 'drivingQuestion',
}

/** Actionable hint for an unexpected key (alias of a canonical field, or a known corruption). */
function hintForKey(key: string): string {
  if (ALIAS_OF[key]) return ` (non-canonical alias of "${ALIAS_OF[key]}")`
  if (/^safety\d+otes$/.test(key)) return ' (likely a corrupted "safetyNotes")'
  return ''
}

const jsonType = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

/** True if `value` satisfies one of the schema's declared `type`s. */
function matchesType(value: unknown, types: string[]): boolean {
  return types.some((t) => {
    switch (t) {
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value)
      case 'number':
        return typeof value === 'number'
      case 'string':
        return typeof value === 'string'
      case 'null':
        return value === null
      default:
        return false
    }
  })
}

/** Recursively collect drift messages for `value` against `node`, prefixing paths with `path`. */
function walk(value: unknown, node: Schema, path: string, out: string[]): void {
  const types = node.type ? (Array.isArray(node.type) ? node.type : [node.type]) : []
  if (types.length && !matchesType(value, types)) {
    out.push(`${path}: expected ${types.join('|')}, got ${jsonType(value)}`)
    return // a type mismatch makes deeper checks meaningless
  }
  if (value === null) return // a permitted null (e.g. an intentionally-omitted section)

  if (node.enum && !node.enum.includes(value as never)) {
    out.push(`${path}: value ${JSON.stringify(value)} not in allowed [${node.enum.map(String).join(', ')}]`)
  }
  if (node.pattern && typeof value === 'string' && !new RegExp(node.pattern).test(value)) {
    out.push(`${path}: ${JSON.stringify(value)} does not match pattern /${node.pattern}/`)
  }
  if (typeof node.minimum === 'number' && typeof value === 'number' && value < node.minimum) {
    out.push(`${path}: ${value} is below minimum ${node.minimum}`)
  }

  if (Array.isArray(value) && node.items) {
    if (typeof node.minItems === 'number' && value.length < node.minItems) {
      out.push(`${path}: has ${value.length} item(s), needs at least ${node.minItems}`)
    }
    value.forEach((item, i) => walk(item, node.items!, `${path}[${i}]`, out))
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of node.required ?? []) {
      if (!(key in obj)) out.push(`${path === '' ? key : `${path}.${key}`}: required field missing`)
    }
    const props = node.properties ?? {}
    for (const [key, v] of Object.entries(obj)) {
      const childPath = path === '' ? key : `${path}.${key}`
      if (key in props) {
        walk(v, props[key]!, childPath, out)
      } else if (node.additionalProperties === false) {
        out.push(`${childPath}: unexpected key${hintForKey(key)}`)
      }
    }
  }
}

/**
 * Validate a raw ARES data object against the canonical contract. Returns drift messages
 * (each `path: reason`); an empty array means the object conforms.
 */
export function contractDrift(raw: unknown): string[] {
  const out: string[] = []
  walk(raw, schema, '', out)
  return out
}

/** A one-line ingest warning when an object drifts from the contract (`null` if it conforms). */
export function contractDriftSummary(raw: unknown): string | null {
  const drift = contractDrift(raw)
  if (drift.length === 0) return null
  return `contract drift: ${drift.length} field(s) diverge from ares-contract.schema.json — run scripts/contract-drift.ts for detail`
}
