/**
 * The ARES release fingerprint, format **`ares-content-v1`** (2026-10-19).
 *
 * Two schools that upload the same ARES release must agree it is the same version without ever
 * communicating, so a later school network can give their edits a common ancestor. The fingerprint is
 * a hash of the bundle's content under fixed normalisation rules, written in a self-describing form:
 *
 *   ares-content-v1:sha256:<64 lowercase hex>
 *
 * ⚑ FROZEN. These rules are deliberately a COPY, not a call into `lib/versionContent.ts`
 * (`comparableContent`): that may change with
 * the product, and a fingerprint that silently changed would stop matching every copy already stored
 * at every school. The test vectors in `tests/unit/releaseFingerprint.spec.ts` pin the output. A rule
 * change is a NEW format (`ares-content-v2`) alongside this one — never an edit here.
 *
 * The same input must give the same fingerprint whether it is the bundle being uploaded or the version
 * as stored, because the backfill only has the stored copy. So, like the ingest comparison it was
 * copied from, v1:
 *   - covers exactly `title`, `meta`, `unit`, `lessons`, `finalExplanation`, `summaryTable`;
 *   - drops every `id` key (Payload row ids differ per installation);
 *   - drops `null`, `''`, empty arrays and objects with nothing left (Payload pads optional fields);
 *   - treats a resource record whose every value is empty, `false` or `0` as absent (Payload pads an
 *     ARES `null` video/reading with empty columns, including booleans and numbers);
 *   - numbers `lessons[]` and `summaryTable.lessons[]` by position (the save hook derives `number`);
 *   - serialises with keys sorted at every level.
 */
import { createHash } from 'node:crypto'

export const RELEASE_FINGERPRINT_FORMAT = 'ares-content-v1'

const RESOURCE_SLOTS = new Set(['video', 'reading'])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A Payload-padded resource group: every value empty, false or zero. */
const isPaddedResource = (value: unknown): boolean =>
  isPlainObject(value) &&
  Object.entries(value).every(
    ([key, child]) =>
      key === 'id' ||
      child === null ||
      child === undefined ||
      child === '' ||
      child === false ||
      child === 0,
  )

const normalise = (value: unknown, key?: string): unknown => {
  if (value === null || value === undefined || value === '') return undefined
  if (key !== undefined && RESOURCE_SLOTS.has(key) && isPaddedResource(value)) return undefined
  if (Array.isArray(value)) {
    const rows = value.map((row) => normalise(row))
    return rows.length ? rows : undefined
  }
  if (!isPlainObject(value)) return value
  const entries = Object.keys(value)
    .filter((child) => child !== 'id')
    .sort()
    .flatMap((child) => {
      const normalised = normalise(value[child], child)
      return normalised === undefined ? [] : [[child, normalised] as const]
    })
  return entries.length ? Object.fromEntries(entries) : undefined
}

const numbered = (rows: unknown): unknown =>
  Array.isArray(rows)
    ? rows.map((row, index) => (isPlainObject(row) ? { ...row, number: index + 1 } : row))
    : rows

/** Keys sorted at every level; arrays keep their order. Frozen with the format. */
const serialise = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(serialise).join(',')}]`
  if (isPlainObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialise(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** The canonical v1 text for a bundle — exported for the test vectors, not for comparison use. */
export function releaseFingerprintInput(bundle: Record<string, unknown>): string {
  const summary = bundle.summaryTable
  return serialise(
    normalise({
      title: bundle.title,
      meta: bundle.meta,
      unit: bundle.unit,
      lessons: numbered(bundle.lessons),
      finalExplanation: bundle.finalExplanation,
      summaryTable: isPlainObject(summary)
        ? { ...summary, lessons: numbered(summary.lessons) }
        : summary,
    }) ?? {},
  )
}

/** `ares-content-v1:sha256:<hex>` for an uploaded bundle or a stored release version. */
export function releaseFingerprint(bundle: Record<string, unknown>): string {
  const digest = createHash('sha256').update(releaseFingerprintInput(bundle), 'utf8').digest('hex')
  return `${RELEASE_FINGERPRINT_FORMAT}:sha256:${digest}`
}
