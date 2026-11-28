import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import sharp from 'sharp'

import { IngestError } from '../ingest/errors'
import { isObject } from '../ingest/resourceLinks'
import {
  MAX_EXPANDED_BYTES,
  MAX_FILE_BYTES,
  openUploadZip,
  readZipEntry,
} from '../ingest/uploadFiles'
import { canonicalJson } from '../lib/canonicalJson'
import { artIdPattern, deckArtIds, deckSpecErrors } from './spec'

const lessonOf = (name: string) => {
  const match = /^L(\d+)(?:\.spec)?\.json$/i.exec(basename(name))
  return match ? Number(match[1]) : 0
}
const validNumber = (n: number) => Number.isSafeInteger(n) && n > 0

export type DeckImportSpec = {
  lessonNumber: number
  title: string
  fingerprint: string
  raw: Record<string, unknown>
  artIds: Set<string>
}

function parseSpec(name: string, text: string, lessonNumber: number): DeckImportSpec {
  if (!validNumber(lessonNumber)) {
    throw new IngestError(`${name}: choose a lesson number or use a name like L1.spec.json.`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new IngestError(`${name}: the file must contain valid JSON.`)
  }
  const errors = deckSpecErrors(raw)
  if (!isObject(raw) || errors.length) {
    throw new IngestError(`${name}: ${errors.slice(0, 4).join('; ')}`)
  }
  return {
    lessonNumber,
    title: raw.lesson_title_short as string,
    fingerprint: createHash('sha256').update(canonicalJson(raw)).digest('hex'),
    raw,
    artIds: deckArtIds(raw),
  }
}

const imageTypes = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const
type DeckArtFile = { data: Buffer; mimetype: string; name: string; size: number }

export async function readDeckUpload(
  file: File,
  lessonNumber?: number,
): Promise<{ specs: DeckImportSpec[]; art: Map<string, DeckArtFile> }> {
  const art = new Map<string, DeckArtFile>()
  if (/\.json$/i.test(file.name)) {
    if (file.size > MAX_FILE_BYTES) throw new IngestError('The deck spec is too large.')
    const fileNumber = lessonOf(file.name)
    if (fileNumber && lessonNumber !== undefined && lessonNumber !== fileNumber) {
      throw new IngestError('The lesson number does not match the file name.')
    }
    return { specs: [parseSpec(file.name, await file.text(), lessonNumber ?? fileNumber)], art }
  }
  if (!/\.zip$/i.test(file.name)) throw new IngestError('Choose a JSON deck spec or a ZIP file.')
  if (lessonNumber !== undefined) {
    throw new IngestError('Leave the lesson number blank when uploading a ZIP file.')
  }

  const zip = await openUploadZip(file)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  const budget = { limit: MAX_EXPANDED_BYTES, remaining: MAX_EXPANDED_BYTES }
  const specs: DeckImportSpec[] = []
  const lessons = new Set<number>()
  for (const entry of entries) {
    const name = entry.unsafeOriginalName ?? entry.name
    if (!/\.spec\.json$/i.test(name) && !lessonOf(name)) continue
    const number = lessonOf(name)
    if (lessons.has(number)) {
      throw new IngestError(`The ZIP has more than one spec for Lesson ${number}.`)
    }
    const text = (await readZipEntry(entry, budget)).toString('utf8')
    specs.push(parseSpec(name, text, number))
    lessons.add(number)
  }
  if (!specs.length) throw new IngestError('The ZIP has no specs named like L1.spec.json.')

  const needed = new Set(specs.flatMap((spec) => [...spec.artIds]))
  for (const entry of entries) {
    const fileName = basename(entry.unsafeOriginalName ?? entry.name)
    const artId = basename(fileName, extname(fileName))
    if (!/\.(png|jpe?g|webp)$/i.test(fileName) || !artIdPattern.test(artId) || !needed.has(artId)) {
      continue
    }
    if (art.has(artId)) throw new IngestError(`The ZIP has more than one picture named ${artId}.`)
    const data = await readZipEntry(entry, budget, 10 * 1024 * 1024, 'picture')
    const metadata = await sharp(data).metadata().catch(() => null)
    const format = metadata?.format as keyof typeof imageTypes | undefined
    if (!format || !Object.hasOwn(imageTypes, format)) {
      throw new IngestError(`${fileName}: choose a PNG, JPEG, or WebP picture.`)
    }
    art.set(artId, {
      data,
      mimetype: imageTypes[format],
      name: `${artId}.${format}`,
      size: data.length,
    })
  }

  return { specs, art }
}
