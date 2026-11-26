/**
 * Contract drift check (SPEC §7 data-contract collaboration with ARES).
 *
 * Validates a RAW ARES data object (the UPPERCASE `META`/`UNIT`/`LESSONS`/`FINAL_EXPLANATION`/
 * `SUMMARY_TABLE` shape, BEFORE `rawToBundle`) against the contract revision its own `schemaVersion`
 * names. ⚑ ONE SCHEMA FILE PER REVISION, chosen by `schemaVersion` (2026-11-26):
 *   - `ares-contract.schema.json` — the CURRENT upstream contract, copied byte-verbatim from
 *     `markknit/cbe-generation-system` (pin and hash in `generator/vendor/PROVENANCE.md`; a unit test
 *     recomputes the hash). Revision R1, `schemaVersion` 1.1.0: rubric rows carry `belowExpectations`.
 *   - `ares-contract-1.0.0.schema.json` — revision R0, frozen. Lesson plans exported before R1 (and
 *     every Lesson3 export made before this change) are still accepted.
 * A later revision R2 is a new upstream file in the first slot, with the old one frozen beside it. It returns a list of human-readable DRIFT messages (`[]` = conforms). Ingest treats drift
 * as a HARD GATE — any divergence fails pre-flight and nothing is written (see `ingestItems` in
 * ingest/index.ts; the warn-only → hard-gate promotion is recorded in docs/DECISIONS.md). See also
 * docs/ARES-DATA-REQUEST.md.
 *
 * This is a deliberately small, dependency-free validator covering ONLY the JSON-Schema keywords
 * our own schema uses (`$defs` / local `$ref` / type / required / properties /
 * additionalProperties:false / items / minItems / minimum / enum / pattern). We don't pull in a general validator (ajv): the keyword
 * set is fixed and authored by us, the project pins deps deliberately, and a bespoke checker lets
 * us emit ACTIONABLE messages (alias-of / likely-typo hints) instead of generic schema errors.
 * It is matched by a DB-less gate (scripts/contract-check.ts) so the hand-rolled logic is proven.
 */
import schemaR0Json from './ares-contract-1.0.0.schema.json'
import schemaJson from './ares-contract.schema.json'

type Schema = {
  $ref?: string
  $defs?: Record<string, Schema>
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

const CURRENT = schemaJson as unknown as Schema
const R0 = schemaR0Json as unknown as Schema

/** Every accepted revision, keyed by the single `schemaVersion` its own enum allows. */
const SCHEMAS: ReadonlyMap<string, Schema> = new Map(
  [R0, CURRENT].map((s) => [String(s.properties!.schemaVersion!.enum![0]), s]),
)

/** The contract versions this program accepts, oldest first (e.g. `['1.0.0', '1.1.0']`). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = [...SCHEMAS.keys()]

/** The version Lesson3 writes when it exports a lesson plan (the current upstream revision). */
export const CURRENT_SCHEMA_VERSION: string = String(CURRENT.properties!.schemaVersion!.enum![0])

/**
 * The schema a raw object is checked against. A missing or unknown `schemaVersion` is checked
 * against the current revision with its version enum widened to every supported version, so the
 * one message it produces names everything this program reads.
 */
function schemaFor(raw: unknown): Schema {
  const version =
    raw !== null && typeof raw === 'object' && Object.hasOwn(raw, 'schemaVersion')
      ? (raw as Record<string, unknown>).schemaVersion
      : undefined
  const known = typeof version === 'string' ? SCHEMAS.get(version) : undefined
  if (known) return known
  return {
    ...CURRENT,
    properties: {
      ...CURRENT.properties,
      schemaVersion: { ...CURRENT.properties!.schemaVersion!, enum: [...SUPPORTED_SCHEMA_VERSIONS] },
    },
  }
}

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
  if (Object.hasOwn(ALIAS_OF, key)) return ` (non-canonical alias of "${ALIAS_OF[key]}")`
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
      case 'boolean':
        return typeof value === 'boolean'
      case 'null':
        return value === null
      default:
        return false
    }
  })
}

/** Resolve the local `#/$defs/<name>` references used to keep resource schemas single-sourced. */
function resolveNode(node: Schema, root: Schema): Schema {
  if (!node.$ref) return node
  const match = /^#\/\$defs\/([^/]+)$/.exec(node.$ref)
  const resolved = match ? root.$defs?.[match[1]!] : undefined
  if (!resolved) throw new Error(`Unsupported or missing contract schema reference: ${node.$ref}`)
  return resolved
}

/** Recursively collect drift messages for `value` against `node`, prefixing paths with `path`. */
function walk(value: unknown, node: Schema, path: string, out: string[], root: Schema): void {
  node = resolveNode(node, root)
  const types = node.type ? (Array.isArray(node.type) ? node.type : [node.type]) : []
  if (types.length && !matchesType(value, types)) {
    out.push(`${path}: expected ${types.join('|')}, got ${jsonType(value)}`)
    return // a type mismatch makes deeper checks meaningless
  }
  if (value === null) return // a permitted null (e.g. an intentionally-omitted section)

  if (node.enum && !node.enum.includes(value as never)) {
    out.push(
      `${path}: value ${JSON.stringify(value)} not in allowed [${node.enum.map(String).join(', ')}]`,
    )
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
    value.forEach((item, i) => walk(item, node.items!, `${path}[${i}]`, out, root))
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(obj, key))
        out.push(`${path === '' ? key : `${path}.${key}`}: required field missing`)
    }
    const props = node.properties ?? {}
    for (const [key, v] of Object.entries(obj)) {
      const childPath = path === '' ? key : `${path}.${key}`
      // ⚑ `Object.hasOwn`, not `in`: `in` also finds `Object.prototype` members, so `constructor`,
      // `toString` and friends counted as declared keys and slipped past the gate (audit F-C40-001).
      if (Object.hasOwn(props, key)) {
        walk(v, props[key]!, childPath, out, root)
      } else if (node.additionalProperties === false) {
        out.push(`${childPath}: unexpected key${hintForKey(key)}`)
      }
    }
  }
}

/**
 * Validate a raw ARES data object against the contract revision it names. Returns drift messages
 * (each `path: reason`); an empty array means the object conforms.
 */
export function contractDrift(raw: unknown): string[] {
  const out: string[] = []
  const root = schemaFor(raw)
  walk(raw, root, '', out, root)
  return out
}
