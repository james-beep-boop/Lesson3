/** JSON/ZIP input preparation. Archives stay in memory; uploaded paths never touch the filesystem. */
import JSZip from 'jszip'
import type { Readable } from 'node:stream'

import type { IngestItem, IngestRejection } from './index'
import { IngestError } from './errors'
import { extractAresJson } from './extract'

/**
 * ⚑ SIZED FROM A REAL EXPORT (2026-10-11). The current ARES archive is 7.4 MB holding 95 JSON lesson plans,
 * 33.3 MB expanded (average 359 KB, largest 588 KB): about 4.7× compression. The operator expects archives
 * of up to ~20 MB, i.e. roughly 255 files and 90 MB expanded. The first limits (50 JSON files per upload)
 * rejected even today's archive outright. These leave about 2× headroom over a 20 MB archive:
 */
/** JSON lesson plans per upload, standalone and inside archives together (~255 expected at 20 MB). */
export const MAX_FILES = 500
/** One lesson plan's JSON, expanded (the largest real one is 588 KB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** One archive, compressed (20 MB expected). */
export const MAX_ZIP_BYTES = 50 * 1024 * 1024
/** All JSON in one upload, expanded (~90 MB expected at 20 MB). Bounds what is parsed and held at once. */
export const MAX_EXPANDED_BYTES = 200 * 1024 * 1024
/** The request body: at most the expanded budget's worth of input, plus multipart overhead. */
export const MAX_BODY_BYTES = MAX_EXPANDED_BYTES + 256 * 1024
const MAX_ZIP_ENTRIES = 1000

/** The expanded-byte budget shared by every JSON in one upload. */
interface Budget {
  limit: number
  remaining: number
}

const overBudget = (limit: number) =>
  new IngestError(`The upload expands to more than ${limit} bytes of JSON. Upload it in parts.`)

const EOCD = 0x06054b50 // end of central directory
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const CENTRAL_FILE_HEADER = 0x02014b50

/**
 * How many central-directory records JSZip WILL read from this archive, counted without building them —
 * stopping as soon as the count passes `limit`. Null when the directory cannot be located (JSZip would
 * reject the archive too, so it is refused as unreadable without calling JSZip at all).
 *
 * ⚑ COUNT THE RECORDS, NOT THE DECLARATION, AND NOT THE PARSED KEYS (review of #382, GPT 2026-10-11).
 * loadAsync builds an object for every record before any limit can be applied, so the count must come
 * first. The end-of-directory record's own count is a CLAIM: an archive declaring 1 entry and carrying
 * 1,001 passed a declared-count check, and because JSZip keys entries by normalized name, duplicates
 * also collapsed below the post-parse `zip.files` count. JSZip reads records for as long as their
 * signatures match, ignoring the declared count (`zipEntries.js` `readCentralDir`), so this does the same.
 *
 * It locates the directory exactly as JSZip 3.10 does (`readEndOfCentral`): the LAST end-of-directory
 * signature in the whole buffer, the ZIP64 locator and record when any field is saturated, and a
 * "zero" shift by any bytes found between the directory's declared end and the record.
 *
 * ⚑ ONLY NUMBERS BOTH PARSERS READ ALIKE (GPT review 2026-10-11). JSZip reads integers with 32-bit
 * arithmetic (`DataReader.readInt`: `(result << 8) + byte`), so an 8-byte ZIP64 field over 2³¹ is
 * truncated, even turned negative, and a 4-byte one over 2³¹ goes negative. Reading the full value here
 * let a crafted ZIP64 locator send this count and JSZip to DIFFERENT directories: a 186 KB archive of
 * 1,001 entries counted as zero. Any offset or size field at or above 2³¹ (other than the ZIP64
 * sentinel) is refused as unreadable — a ≤ 50 MB archive never needs one — and below it the two
 * readings are identical.
 */
export function zipDirectoryEntries(bytes: Uint8Array, limit: number): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const SAFE = 0x80000000 // 2³¹: below this, JSZip's 32-bit readInt and an exact read agree
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  /** A 64-bit field, or NaN when it is too large for JSZip to read the same way. */
  const u64 = (at: number) => {
    const value = view.getBigUint64(at, true)
    return value < BigInt(SAFE) ? Number(value) : Number.NaN
  }
  const isSig = (at: number, sig: number) =>
    at >= 0 && at + 4 <= bytes.byteLength && u32(at) === sig
  const lastIndexOf = (sig: number) => {
    for (let at = bytes.byteLength - 4; at >= 0; at--) if (u32(at) === sig) return at
    return -1
  }

  const eocd = lastIndexOf(EOCD)
  if (eocd < 0 || eocd + 22 > bytes.byteLength) return null
  let cdSize = u32(eocd + 12)
  let cdOffset = u32(eocd + 16)
  const zip64 =
    [u16(eocd + 4), u16(eocd + 6), u16(eocd + 8), u16(eocd + 10)].includes(0xffff) ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  let zip64Tail = 0
  if (zip64) {
    const locator = lastIndexOf(ZIP64_LOCATOR)
    if (locator < 0 || locator + 20 > bytes.byteLength) return null
    let record = u64(locator + 8)
    // Out of range: JSZip would read a truncated offset this count cannot follow. Refuse, no fallback.
    if (Number.isNaN(record)) return null
    if (!isSig(record, ZIP64_EOCD)) record = lastIndexOf(ZIP64_EOCD)
    if (record < 0 || record + 56 > bytes.byteLength) return null
    cdSize = u64(record + 40)
    cdOffset = u64(record + 48)
    zip64Tail = 20 + 12 + u64(record + 4)
  }
  if (![cdSize, cdOffset, zip64Tail].every((n) => Number.isFinite(n) && n < SAFE)) return null
  const extra = eocd - (cdOffset + cdSize + zip64Tail)
  if (extra < 0) return null
  let at = cdOffset + extra
  let count = 0
  while (at + 46 <= bytes.byteLength && u32(at) === CENTRAL_FILE_HEADER) {
    if (++count > limit) return count
    at += 46 + u16(at + 28) + u16(at + 30) + u16(at + 32)
  }
  return count
}

/** Stop inflation at the actual byte limit, including when ZIP size metadata is dishonest. */
function readJsonEntry(entry: JSZip.JSZipObject, budget: Budget): Promise<Record<string, unknown>> {
  // JSZip uses readable-stream 2, whose streams do not support async iteration.
  const stream = entry.nodeStream('nodebuffer') as Readable
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const stop = (error: IngestError) => {
      // After destroy(), JSZip's adapter pauses its inflater once the stream stops accepting data.
      stream.destroy()
      chunks.length = 0
      reject(error)
    }
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      budget.remaining -= chunk.length
      if (size > MAX_FILE_BYTES) {
        stop(new IngestError(`Exceeds the ${MAX_FILE_BYTES}-byte JSON limit`))
        return
      }
      if (budget.remaining < 0) {
        stop(overBudget(budget.limit))
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

/** An item whose content was already read: `extract` replays the outcome, value or error. */
const settledItem = (name: string, outcome: Promise<Record<string, unknown>>): IngestItem => {
  const settled = outcome.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  return {
    name,
    extract: async () => {
      const result = await settled
      if (!result.ok) throw result.error
      return result.value
    },
  }
}

export async function prepareUploadFiles(
  files: File[],
  // Overridable so tests can exercise the budget without building a 200 MB archive.
  { expandedBytes = MAX_EXPANDED_BYTES }: { expandedBytes?: number } = {},
): Promise<{
  items: IngestItem[]
  rejected: IngestRejection[]
  skipped: IngestRejection[]
}> {
  const items: IngestItem[] = []
  const rejected: IngestRejection[] = []
  const skipped: IngestRejection[] = []
  const budget: Budget = { limit: expandedBytes, remaining: expandedBytes }
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
        continue
      }
      budget.remaining -= file.size
      if (budget.remaining < 0) throw overBudget(budget.limit)
      items.push({ name: file.name, extract: async () => extractAresJson(await file.text()) })
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
    // ⚑ ONE ARCHIVE AT A TIME (review of #382, 2026-10-11). Each archive is opened, its JSON read within
    // the budget, and then released before the next is touched. Previously every archive stayed open
    // until the import finished (lazy `extract` closures held their entries), so its bytes sat in memory
    // twice — the uploaded File and JSZip's copy — for every archive at once.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const records = zipDirectoryEntries(bytes, MAX_ZIP_ENTRIES)
    if (records == null) {
      rejected.push({
        file: file.name,
        error: 'Cannot read ZIP archive (invalid, corrupt, or encrypted)',
      })
      continue
    }
    if (records > MAX_ZIP_ENTRIES) {
      rejected.push({ file: file.name, error: `Too many ZIP entries (max ${MAX_ZIP_ENTRIES})` })
      continue
    }
    let zip: JSZip
    try {
      // Do not use checkCRC32 here: it inflates ALL entries eagerly, before our byte limits.
      zip = await JSZip.loadAsync(bytes)
    } catch {
      rejected.push({
        file: file.name,
        error: 'Cannot read ZIP archive (invalid, corrupt, or encrypted)',
      })
      continue
    }
    const entries = Object.values(zip.files)
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
      const outcome = readJsonEntry(entry, budget)
      // Read now, in order, so the archive can be released; an over-budget upload stops here.
      await outcome.catch((error: unknown) => {
        if (budget.remaining < 0) throw overBudget(budget.limit)
        void error // a per-file failure is replayed by the item and reported as that file's rejection
      })
      items.push(settledItem(name, outcome))
    }
    if (!found) rejected.push({ file: file.name, error: 'ZIP contains no JSON lesson-plan files' })
  }
  return { items, rejected, skipped }
}
