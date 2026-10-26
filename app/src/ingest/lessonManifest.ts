/** Lesson-set envelope. This capability version advances with the supported import format. */
import { createHash } from 'node:crypto'
import { IngestError } from './errors'

export const LESSON_PROGRAM_VERSION = '1.08'
export type AresRelease = { id: string; date: string }
export type LessonManifest = {
  format: number
  release: AresRelease
  schemaVersion: string
  minProgram: string
  files: Record<string, { sha256: string; kind?: string }>
}
export class LessonSetRefused extends IngestError {
  constructor(
    message: string,
    readonly setId?: string,
  ) {
    super(message)
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const numericVersion = (v: string) => /^\d+\.\d+(?:\.\d+)?$/.test(v)
const newer = (a: string, b: string) => {
  const av = a.split('.').map(Number),
    bv = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((av[i] ?? 0) !== (bv[i] ?? 0)) return (av[i] ?? 0) > (bv[i] ?? 0)
  }
  return false
}
export function parseLessonManifest(
  text: string | undefined,
  program = /^v\d+\.\d+(?:\.\d+)?$/.test(process.env.APP_RELEASE_VERSION ?? '')
    ? process.env.APP_RELEASE_VERSION!.slice(1)
    : LESSON_PROGRAM_VERSION,
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
  if (Number(v.format) > 1 || v.schemaVersion !== '1.0.0' || newer(v.minProgram, program)) {
    throw new LessonSetRefused(
      `This lesson set needs a newer Lesson3. Update the program first. Set: format ${v.format}, schema ${v.schemaVersion}, minimum program ${v.minProgram}; this program: ${program}, format 1, schema 1.0.0.`,
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
