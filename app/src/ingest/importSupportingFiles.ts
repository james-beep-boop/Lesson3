import { createHash, createHmac } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { commitTransaction, initTransaction, killTransaction, type Payload } from 'payload'

import { relId } from '@/lib/relId'
import { lockRows } from '@/lib/txDb'
import type { SupportingFile } from '@/payload-types'
import type { IngestReq } from './index'
import type { SupportingFileInput } from './supportingFileInputs'
import { matchSupportingFileName, type SupportingFileTarget } from './supportingFileNames'

type Attachment = {
  lessonPlan: number
  title: string
  lessonNumber: number | null
  kind: SupportingFile['kind']
}

type ReportRow = { file: string } & (
  | { status: 'unmatched'; reason: string }
  | { status: 'matched' | 'alreadyHere'; attachment: Attachment; reason?: string }
)

export type SupportingFileReport = {
  rows: ReportRow[]
  previewToken: string
  imported: number
}

type Pending = {
  attachment: Attachment
  input: Extract<SupportingFileInput, { bytes: Buffer }>
}

async function targetsFor(prefixes: string[], req: IngestReq) {
  const targets = new Map<string, SupportingFileTarget[]>()
  if (prefixes.length === 0) return targets
  const { docs: versions } = await req.payload.find({
    collection: 'lesson-bundle-versions',
    where: { 'meta.filePrefix': { in: prefixes } },
    select: { meta: { filePrefix: true }, lessons: { number: true } },
    depth: 0,
    pagination: false,
    req,
  })
  if (versions.length === 0) return targets
  const versionsById = new Map(versions.map((version) => [version.id, version]))
  const { docs: plans } = await req.payload.find({
    collection: 'lesson-plans',
    where: { officialVersion: { in: [...versionsById.keys()] } },
    select: { title: true, officialVersion: true },
    depth: 0,
    pagination: false,
    req,
  })
  for (const plan of plans) {
    const versionId = relId(plan.officialVersion)
    const version = versionId === null ? undefined : versionsById.get(versionId)
    if (!version || !version.meta?.filePrefix) continue
    const prefix = version.meta.filePrefix
    const target = {
      id: plan.id,
      title: plan.title,
      lessons: new Set(
        (version.lessons ?? []).flatMap(({ number }) => (number == null ? [] : [number])),
      ),
    }
    targets.set(prefix, [...(targets.get(prefix) ?? []), target])
  }
  return targets
}

function attachmentKey(
  plan: number | null,
  lesson: number | null | undefined,
  kind: SupportingFile['kind'],
  size: number,
): string {
  return JSON.stringify([plan, lesson ?? null, kind, size])
}

function storageDirectory(payload: Payload) {
  const directory = payload.collections['supporting-files'].config.upload?.staticDir
  if (!directory) throw new Error('The supporting files directory is missing.')
  return directory
}

// Compare against the actual stored bytes, including files uploaded one at a time.
async function storedHashes(matches: Pending[], req: IngestReq) {
  const hashes = new Set<string>()
  if (!matches.length) return hashes
  const keys = new Set(
    matches.map(({ attachment: { lessonPlan, lessonNumber, kind }, input }) =>
      attachmentKey(lessonPlan, lessonNumber, kind, input.bytes.length),
    ),
  )
  const { docs } = await req.payload.find({
    collection: 'supporting-files',
    where: {
      lessonPlan: { in: [...new Set(matches.map(({ attachment }) => attachment.lessonPlan))] },
      filesize: { in: [...new Set(matches.map(({ input }) => input.bytes.length))] },
    },
    select: { filename: true, filesize: true, lessonPlan: true, lessonNumber: true, kind: true },
    depth: 0,
    pagination: false,
    req,
  })
  const directory = storageDirectory(req.payload)
  for (const doc of docs) {
    if (doc.filesize == null || !doc.filename) continue
    const key = attachmentKey(relId(doc.lessonPlan), doc.lessonNumber, doc.kind, doc.filesize)
    if (!keys.has(key)) continue
    if (basename(doc.filename) !== doc.filename) throw new Error('Invalid supporting file name.')
    const hash = createHash('sha256')
    try {
      for await (const chunk of createReadStream(join(directory, doc.filename))) hash.update(chunk)
    } catch (error) {
      // A removed row's file may disappear after the query.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    hashes.add(key + hash.digest('hex'))
  }
  return hashes
}

async function planImport(inputs: SupportingFileInput[], req: IngestReq) {
  const prefixes = new Set<string>()
  for (const input of inputs) {
    if ('reason' in input) continue
    prefixes.add(input.name.prefix)
    if (input.name.literalPrefix) prefixes.add(input.name.literalPrefix)
  }
  const targets = await targetsFor([...prefixes], req)
  const candidates = inputs.map((input): Pending | ReportRow => {
    if ('reason' in input) return { ...input, status: 'unmatched' }
    const match = matchSupportingFileName(input.name, targets)
    if ('reason' in match) return { file: input.file, status: 'unmatched', reason: match.reason }
    const { lessonNumber, kind } = input.name
    return {
      input,
      attachment: { lessonPlan: match.target.id, title: match.target.title, lessonNumber, kind },
    }
  })
  const hashes = await storedHashes(
    candidates.filter((item) => 'input' in item),
    req,
  )
  const queued = new Set<string>()
  const pending: Pending[] = []
  const rows = candidates.map((candidate): ReportRow => {
    if (!('input' in candidate)) return candidate
    const { attachment, input } = candidate
    const { lessonPlan, lessonNumber, kind } = attachment
    const key = attachmentKey(lessonPlan, lessonNumber, kind, input.bytes.length) + input.hash
    const info = { file: input.file, attachment }
    if (hashes.has(key)) return { ...info, status: 'alreadyHere' }
    if (queued.has(key))
      return { ...info, status: 'alreadyHere', reason: 'Same as another file in this upload.' }
    queued.add(key)
    pending.push(candidate)
    return { ...info, status: 'matched' }
  })
  const previewToken = createHmac('sha256', req.payload.secret)
    .update(JSON.stringify([rows, pending.map(({ input }) => input.hash)]))
    .digest('hex')
  return { pending, report: { rows, previewToken, imported: 0 } }
}

export async function importSupportingFiles(
  payload: Payload,
  inputs: SupportingFileInput[],
  confirmation?: string,
): Promise<SupportingFileReport> {
  const req: IngestReq = { payload }
  const preview = await planImport(inputs, req)
  if (confirmation !== preview.report.previewToken || !preview.pending.length) return preview.report

  const directory = storageDirectory(payload)
  const written: string[] = []
  let report: SupportingFileReport
  await initTransaction(req)
  try {
    // Serialize imports for the same plans and re-check the match and hash after taking the locks.
    await lockRows(
      req,
      'lesson_plans',
      preview.pending.map(({ attachment }) => attachment.lessonPlan),
    )
    const current = await planImport(inputs, req)
    report = current.report
    if (confirmation === report.previewToken) {
      for (const {
        attachment: { lessonPlan, lessonNumber, kind },
        input,
      } of current.pending) {
        const doc = await payload.create({
          collection: 'supporting-files',
          data: { lessonPlan, lessonNumber, kind, title: input.name.name.slice(0, 200) },
          file: {
            name: input.name.name,
            mimetype: input.name.mimeType,
            data: input.bytes,
            size: input.bytes.length,
          },
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (doc.filename) written.push(doc.filename)
      }
      report.imported = written.length
    }
  } catch (error) {
    await killTransaction(req)
    // Payload writes bytes before inserting the row. Rolling back the database leaves those bytes.
    for (const filename of written) {
      await rm(join(directory, filename), { force: true }).catch((err: unknown) => {
        payload.logger.error({ err, filename }, 'Could not remove a rolled-back supporting file')
      })
    }
    throw error
  }
  await commitTransaction(req)
  return report
}
