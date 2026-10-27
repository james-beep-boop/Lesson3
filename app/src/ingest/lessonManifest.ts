/** Lesson-set envelope. This capability version advances with the supported import format. */
import { createHash } from 'node:crypto'
import { releaseTagVersion } from '../lib/appVersion'
import { compareSemver } from '../lib/semver'
import { IngestError } from './errors'
import { isObject as object } from './resourceLinks'

export const LESSON_PROGRAM_VERSION = '1.08'
export type AresRelease = { id: string; date: string }
export type LessonManifest = {
  format: number
  release: AresRelease
  schemaVersion: string
  minProgram: string
  files: Record<string, ManifestFile>
}
export type ManifestFile = { sha256: string; kind?: string }
export class LessonSetRefused extends IngestError {
  constructor(
    message: string,
    readonly setId?: string,
  ) {
    super(message)
  }
}
const numericVersion = (v: string) => /^\d+\.\d+(?:\.\d+)?$/.test(v)
export function parseLessonManifest(
  text: string | undefined,
  program = releaseTagVersion(process.env.APP_RELEASE_VERSION) ?? LESSON_PROGRAM_VERSION,
): LessonManifest | undefined {
  if (text === undefined) return undefined
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new LessonSetRefused('LESSONS.json could not be read: invalid JSON.')
  }
  const bad = (why: string): never => {
    throw new LessonSetRefused(`LESSONS.json could not be read: ${why}.`)
  }
  if (!object(v)) return bad('expected an object')
  if (!Number.isInteger(v.format) || Number(v.format) < 1) return bad('invalid format')
  if (
    !object(v.release) ||
    typeof v.release.id !== 'string' ||
    !v.release.id.trim() ||
    v.release.id.length > 100 ||
    typeof v.release.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.release.date) ||
    !Number.isFinite(Date.parse(v.release.date)) ||
    new Date(v.release.date).toISOString().slice(0, 10) !== v.release.date
  )
    return bad('invalid release id or calendar date')
  if (
    typeof v.schemaVersion !== 'string' ||
    typeof v.minProgram !== 'string' ||
    !numericVersion(v.minProgram)
  )
    return bad('invalid schemaVersion or minProgram')
  if (
    Number(v.format) > 1 ||
    v.schemaVersion !== '1.0.0' ||
    compareSemver(v.minProgram, program) > 0
  ) {
    throw new LessonSetRefused(
      `This lesson set needs a newer version of ARES Lesson Plans. Update the program first. Set: format ${v.format}, schema ${v.schemaVersion}, minimum program ${v.minProgram}; this program: ${program}, format 1, schema 1.0.0.`,
    )
  }
  if (!object(v.files)) return bad('files must map paths to checksums and kinds')
  for (const [name, file] of Object.entries(v.files)) {
    if (
      !name ||
      name.startsWith('/') ||
      name.split('/').some((p) => p === '..' || p === '.') ||
      name.includes('\\') ||
      !object(file) ||
      typeof file.sha256 !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(file.sha256) ||
      (file.kind !== undefined && (typeof file.kind !== 'string' || !file.kind))
    )
      return bad(`invalid file entry ${JSON.stringify(name)}`)
  }
  return v as LessonManifest
}
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')
export const checksumWarning = (bytes: Uint8Array | string, expected?: string): string[] =>
  expected && sha256(bytes) !== expected.toLowerCase()
    ? ['Looks damaged: sha256 does not match LESSONS.json.']
    : []

export const MANIFEST_NAME = 'LESSONS.json'

/** How one entry of a lesson set (zip or directory) is handled, shared by the web upload and the CLI. */
export type LessonSetEntry =
  | { as: 'manifest' }
  | { as: 'waiting'; declared: ManifestFile & { kind: string }; warnings: string[] }
  | { as: 'notLessonPlan'; warnings: string[] }
  | { as: 'lessonPlan'; declared?: ManifestFile; warnings: string[] }

export function classifyLessonSetEntry(
  manifest: LessonManifest | undefined,
  name: string,
): LessonSetEntry {
  if (name === MANIFEST_NAME) return { as: 'manifest' }
  const declared = manifest?.files[name]
  const warnings =
    manifest && !Object.hasOwn(manifest.files, name) ? ['Not listed in LESSONS.json.'] : []
  // A declared kind this program does not import is never parsed; only its checksum is checked.
  if (declared?.kind && declared.kind !== 'lesson-plan')
    return { as: 'waiting', declared: { ...declared, kind: declared.kind }, warnings }
  if (!name.toLowerCase().endsWith('.json') || name.startsWith('__MACOSX/'))
    return { as: 'notLessonPlan', warnings }
  return { as: 'lessonPlan', declared, warnings }
}

/** Files LESSONS.json lists that the set does not contain. */
export const missingFromManifest = (
  manifest: LessonManifest | undefined,
  names: ReadonlySet<string>,
): string[] => Object.keys(manifest?.files ?? {}).filter((name) => !names.has(name))

export const waitingMessage = (kind: string) => `Waiting for a program update (kind: ${kind}).`
export const MISSING_FROM_SET = 'Listed in LESSONS.json but missing from the lesson set.'
