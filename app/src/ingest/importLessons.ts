/** Supported, partial command-line import. No user, no administrator messages. */
import { readdir, readFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'
import { ingestUploadItems, type IngestItem } from './index'
import { extractAresJson } from './extract'
import { parseLessonManifest, checksumWarning, LessonSetRefused } from './lessonManifest'
import type { TaxonomyKey } from './taxonomy'

export type ImportIO = {
  yes: boolean
  ask: (question: string, defaultYes: boolean) => Promise<boolean>
  print: (line: string) => void
}
export async function importLessons(
  payload: Payload,
  directory: string,
  io: ImportIO,
): Promise<number> {
  try {
    const root = path.resolve(directory)
    if (!(await lstat(root)).isDirectory()) throw new Error('Import path must be a directory.')
    const names: string[] = []
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const name = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${name}`)
        if (entry.isDirectory()) await walk(name)
        else names.push(path.relative(root, name).split(path.sep).join('/'))
      }
    }
    await walk(root)
    names.sort()
    const manifest = parseLessonManifest(
      names.includes('LESSONS.json')
        ? await readFile(path.join(root, 'LESSONS.json'), 'utf8')
        : undefined,
    )
    for (const name of Object.keys(manifest?.files ?? {}))
      if (!names.includes(name)) io.print(`Warning: ${name} is listed in LESSONS.json but missing.`)
    const items: IngestItem[] = []
    for (const name of names) {
      if (name === 'LESSONS.json') continue
      const declared = manifest?.files[name]
      if (manifest && !Object.hasOwn(manifest.files, name))
        io.print(`Warning: ${name} is not listed in LESSONS.json.`)
      if (declared?.kind && declared.kind !== 'lesson-plan') {
        for (const warning of checksumWarning(
          await readFile(path.join(root, name)),
          declared.sha256,
        ))
          io.print(`${name}: ${warning}`)
        io.print(`${name}: waiting for a program update (kind: ${declared.kind}).`)
        continue
      }
      if (!name.toLowerCase().endsWith('.json')) continue
      // I/O failures abort before any write. Malformed JSON remains a per-file rejection.
      const bytes = await readFile(path.join(root, name))
      items.push({
        name,
        setId: root,
        release: manifest?.release,
        warnings: checksumWarning(bytes, declared?.sha256),
        extract: () => extractAresJson(bytes.toString('utf8')),
      })
    }
    let approvals: TaxonomyKey[] | undefined
    let token: string | undefined
    for (;;) {
      const report = await ingestUploadItems(payload, items, approvals, token)
      if (report.setRefused?.length) {
        for (const issue of report.setRefused) io.print(issue.error)
        return 3
      }
      if (!report.needsConfirmation) {
        for (const b of report.bundles) {
          io.print(
            `${b.file}: imported ${b.semver}, ${b.official ? 'Official' : 'waiting for the subject-grade administrator'}.`,
          )
          for (const warning of b.warnings) io.print(`${b.file}: ${warning}`)
        }
        for (const issue of [...report.skipped, ...report.rejected])
          io.print(`${issue.file}: ${issue.error}`)
        io.print(
          `Imported ${report.bundles.length}; already here or older ${report.skipped.length}; rejected ${report.rejected.length}.`,
        )
        return report.rejected.length ? 2 : 0
      }
      approvals = []
      for (const m of report.missing) {
        io.print(
          `${m.subject} — Grade ${m.grade}; files: ${m.files.join(', ')}${m.similarTo.length ? `; similar to ${m.similarTo.join(', ')}` : ''}`,
        )
        const accept = io.yes
          ? m.similarTo.length === 0
          : await io.ask(`Create ${m.subject} — Grade ${m.grade}?`, m.similarTo.length === 0)
        if (accept) approvals.push({ subject: m.subject, grade: m.grade })
      }
      for (const p of report.official ?? []) {
        io.print(
          `${p.title}: ${p.willMove ? `will become Official (${p.previousSemver} → ${p.incomingSemver}); ARES release ${p.release?.date ?? 'not stated'}` : p.reason}${p.olderContent ? `; same content as earlier release ${p.olderContent}` : ''}`,
        )
      }
      if (report.confirmationChanged && io.yes) {
        io.print('Something changed since you looked. Run the import again to check the new list.')
        return 4
      }
      if (
        (report.confirmationChanged || report.official?.some((p) => p.willMove)) &&
        !io.yes &&
        !(await io.ask('Confirm these Official updates?', false))
      )
        return 4
      if (
        !io.yes &&
        report.missing.length &&
        approvals.length === 0 &&
        items.length &&
        !report.official?.some((p) => p.plan != null)
      )
        return 4
      token = report.previewToken
    }
  } catch (e) {
    io.print(e instanceof Error ? e.message : String(e))
    return e instanceof LessonSetRefused ? 3 : 1
  }
}
