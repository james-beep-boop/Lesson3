/** JSON/ZIP input preparation. Archives stay in memory; uploaded paths never touch the filesystem. */
import JSZip from 'jszip'

import type { IngestItem, IngestRejection } from './index'
import { IngestError } from './errors'
import { extractAresJson } from './extract'

export const MAX_FILES = 50
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_ZIP_BYTES = 50 * 1024 * 1024
export const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 256 * 1024
const MAX_ZIP_ENTRIES = 1000

/** Stop inflation at the actual byte limit, including when ZIP size metadata is dishonest. */
function readJsonEntry(entry: JSZip.JSZipObject): Promise<Record<string, unknown>> {
  // JSZip uses readable-stream 2, whose streams do not support async iteration.
  const stream = entry.nodeStream('nodebuffer')
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_FILE_BYTES) {
        stream.pause()
        chunks.length = 0
        reject(new IngestError(`Exceeds the ${MAX_FILE_BYTES}-byte JSON limit`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      try {
        resolve(extractAresJson(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
  })
}

export async function prepareUploadFiles(files: File[]): Promise<{
  items: IngestItem[]
  rejected: IngestRejection[]
  skipped: IngestRejection[]
}> {
  const items: IngestItem[] = []
  const rejected: IngestRejection[] = []
  const skipped: IngestRejection[] = []
  let jsonCount = 0
  const countJson = () => {
    if (++jsonCount > MAX_FILES) {
      throw new IngestError(`Too many JSON files (max ${MAX_FILES} across all uploads and ZIPs)`)
    }
  }
  for (const file of files) {
    const extension = file.name.toLowerCase()
    if (extension.endsWith('.json')) {
      countJson()
      if (file.size > MAX_FILE_BYTES) {
        rejected.push({ file: file.name, error: `Exceeds the ${MAX_FILE_BYTES}-byte JSON limit` })
      } else {
        items.push({ name: file.name, extract: async () => extractAresJson(await file.text()) })
      }
      continue
    }
    if (!extension.endsWith('.zip')) {
      rejected.push({ file: file.name, error: 'Only .json and .zip files are accepted' })
      continue
    }
    if (file.size > MAX_ZIP_BYTES) {
      rejected.push({ file: file.name, error: `Exceeds the ${MAX_ZIP_BYTES}-byte ZIP limit` })
      continue
    }
    let zip: JSZip
    try {
      // Do not use checkCRC32 here: it inflates ALL entries eagerly, before our byte limits.
      zip = await JSZip.loadAsync(await file.arrayBuffer())
    } catch {
      rejected.push({
        file: file.name,
        error: 'Cannot read ZIP archive (invalid, corrupt, or encrypted)',
      })
      continue
    }
    const entries = Object.values(zip.files)
    if (entries.length > MAX_ZIP_ENTRIES) {
      rejected.push({ file: file.name, error: `Too many ZIP entries (max ${MAX_ZIP_ENTRIES})` })
      continue
    }
    let found = false
    for (const entry of entries) {
      if (entry.dir) continue
      const originalName = entry.unsafeOriginalName ?? entry.name
      const name = `${file.name}/${originalName}`
      if (!originalName.toLowerCase().endsWith('.json') || originalName.startsWith('__MACOSX/')) {
        skipped.push({ file: name, error: 'Not a JSON lesson-plan file' })
        continue
      }
      found = true
      countJson()
      items.push({ name, extract: () => readJsonEntry(entry) })
    }
    if (!found) rejected.push({ file: file.name, error: 'ZIP contains no JSON lesson-plan files' })
  }
  return { items, rejected, skipped }
}
