import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'

import {
  MAX_EXPANDED_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_ZIP_BYTES,
  prepareUploadFiles,
  zipDirectoryEntries,
} from '../../src/ingest/uploadFiles'

const raw = { META: {}, UNIT: null, LESSONS: [], FINAL_EXPLANATION: null, SUMMARY_TABLE: null }
const archive = async (zip: JSZip, name = 'lessons.zip') =>
  new File([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })], name)

describe('JSON and ZIP upload inputs', () => {
  it('reads nested and uppercase JSON, reports other files, and isolates bad JSON', async () => {
    const zip = new JSZip()
      .file('folder/good.JSON', JSON.stringify(raw))
      .file('broken.json', '{no')
      .file('notes.txt', 'notes')
      .file('__MACOSX/._good.JSON', 'metadata')
    const report = await prepareUploadFiles([await archive(zip)])
    expect(report.items.map((i) => i.name)).toEqual([
      'lessons.zip/folder/good.JSON',
      'lessons.zip/broken.json',
    ])
    expect(await report.items[0].extract()).toEqual(raw)
    await expect(report.items[1].extract()).rejects.toThrow()
    expect(report.skipped.map((i) => i.file)).toEqual([
      'lessons.zip/notes.txt',
      'lessons.zip/__MACOSX/._good.JSON',
    ])
  })

  it('continues past an unreadable ZIP and unsupported upload', async () => {
    const report = await prepareUploadFiles([
      new File(['bad archive'], 'bad.zip'),
      new File(['execute()'], 'evil.js'),
      new File([JSON.stringify(raw)], 'good.json'),
    ])
    expect(report.rejected.map((r) => r.file)).toEqual(['bad.zip', 'evil.js'])
    expect(await report.items[0].extract()).toEqual(raw)
  })

  it('reports archives with no JSON', async () => {
    const report = await prepareUploadFiles([await archive(new JSZip().file('notes.txt', 'x'))])
    expect(report.items).toEqual([])
    expect(report.rejected[0].error).toContain('no JSON')
    expect(report.skipped).toHaveLength(1)
  })

  it('bounds expanded JSON bytes while allowing the next file to be read', async () => {
    const zip = new JSZip()
      .file('huge.json', ' '.repeat(MAX_FILE_BYTES + 1))
      .file('good.json', JSON.stringify(raw))
    const report = await prepareUploadFiles([await archive(zip)])
    await expect(report.items[0].extract()).rejects.toThrow('byte JSON limit')
    expect(await report.items[1].extract()).toEqual(raw)
  })

  it('rejects oversized plain files and compressed archives before reading', async () => {
    const json = new File(['x'], 'big.json')
    const zip = new File(['x'], 'big.zip')
    Object.defineProperty(json, 'size', { value: MAX_FILE_BYTES + 1 })
    Object.defineProperty(zip, 'size', { value: MAX_ZIP_BYTES + 1 })
    const report = await prepareUploadFiles([json, zip])
    expect(report.rejected).toHaveLength(2)
    expect(report.items).toEqual([])
  })

  /** Refuse `file` for too many entries WITHOUT JSZip ever parsing it. */
  async function expectRefusedBeforeParsing(file: File) {
    // ⚑ Review of #382: the count must come before loadAsync builds an object per entry; checking
    // afterwards bounded what was accepted, not the parsing work.
    const load = vi.spyOn(JSZip, 'loadAsync')
    try {
      const report = await prepareUploadFiles([file])
      expect(report.rejected[0]?.error).toContain('Too many ZIP entries')
      expect(report.items).toEqual([])
      expect(report.skipped).toEqual([])
      expect(load).not.toHaveBeenCalled()
    } finally {
      load.mockRestore()
    }
  }

  /** The offset of the last end-of-central-directory record. */
  const eocdOf = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer)
    for (let at = bytes.length - 22; at >= 0; at--)
      if (view.getUint32(at, true) === 0x06054b50) return at
    throw new Error('no EOCD')
  }

  const manyEntries = async (name: (i: number) => string) => {
    const zip = new JSZip()
    for (let i = 0; i < 1001; i++) zip.file(name(i), JSON.stringify(raw))
    return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
  }

  it('counts the real directory records, stopping at the limit', async () => {
    const small = new Uint8Array(
      await new JSZip()
        .file('a.json', '{}')
        .file('b/c.json', '{}')
        .generateAsync({ type: 'uint8array' }),
    )
    // Three RECORDS: a.json, the folder b/ (JSZip writes one), and b/c.json — records, not files.
    expect(zipDirectoryEntries(small, 1000)).toBe(3)
    expect(zipDirectoryEntries(await manyEntries((i) => `${i}.json`), 1000)).toBe(1001)
    expect(zipDirectoryEntries(new TextEncoder().encode('not a zip at all'), 1000)).toBeNull()
  })

  it('refuses an honest oversized archive before parsing it', async () => {
    await expectRefusedBeforeParsing(new File([await manyEntries((i) => `${i}.txt`)], 'big.zip'))
  })

  it('refuses an archive that DECLARES one entry but carries 1,001 (GPT, 2026-10-11)', async () => {
    const bytes = await manyEntries((i) => `${i}.json`)
    const eocd = eocdOf(bytes)
    const view = new DataView(bytes.buffer)
    view.setUint16(eocd + 8, 1, true) // entries on this disk
    view.setUint16(eocd + 10, 1, true) // total entries
    await expectRefusedBeforeParsing(new File([bytes], 'forged.zip'))
  })

  it('refuses 1,001 entries that share one name, which would collapse to a single parsed key', async () => {
    // Fixed-width names, then every name rewritten in place to the same one: local headers and directory
    // records alike. JSZip keys entries by name, so the old post-parse count saw one entry.
    const name = (i: number) => `${String(i).padStart(4, '0')}.json`
    const bytes = Buffer.from(await manyEntries(name))
    for (let i = 1; i < 1001; i++) {
      // Native search: a byte-by-byte loop over 1,001 names took 2.8 s, and timed out under load.
      for (let at = bytes.indexOf(name(i)); at >= 0; at = bytes.indexOf(name(i), at + 1)) {
        bytes.write('0000.json', at)
      }
    }
    await expectRefusedBeforeParsing(new File([bytes], 'duplicates.zip'))
  })

  /**
   * `bytes` (a JSZip archive) rewritten as ZIP64: a ZIP64 end-of-directory record and locator, then an
   * end-of-directory record whose fields are all saturated. `locatorDelta` is added to the locator's
   * 64-bit offset; `comment` becomes the end record's trailing comment.
   */
  function toZip64(bytes: Uint8Array, { locatorDelta = 0n, comment = new Uint8Array() } = {}) {
    const eocd = eocdOf(bytes)
    const v = new DataView(bytes.buffer, bytes.byteOffset)
    const records = BigInt(v.getUint16(eocd + 10, true))
    const out = new Uint8Array(eocd + 56 + 20 + 22 + comment.length)
    out.set(bytes.subarray(0, eocd))
    const o = new DataView(out.buffer)
    o.setUint32(eocd, 0x06064b50, true) // ZIP64 end of central directory
    o.setBigUint64(eocd + 4, 44n, true)
    o.setBigUint64(eocd + 24, records, true)
    o.setBigUint64(eocd + 32, records, true)
    o.setBigUint64(eocd + 40, BigInt(v.getUint32(eocd + 12, true)), true)
    o.setBigUint64(eocd + 48, BigInt(v.getUint32(eocd + 16, true)), true)
    const locator = eocd + 56
    o.setUint32(locator, 0x07064b50, true)
    o.setBigUint64(locator + 8, BigInt(eocd) + locatorDelta, true)
    o.setUint32(locator + 16, 1, true)
    const end = locator + 20
    o.setUint32(end, 0x06054b50, true)
    o.setUint16(end + 8, 0xffff, true)
    o.setUint16(end + 10, 0xffff, true)
    o.setUint32(end + 12, 0xffffffff, true)
    o.setUint32(end + 16, 0xffffffff, true)
    o.setUint16(end + 20, comment.length, true)
    out.set(comment, end + 22)
    return out
  }

  it('counts a valid ZIP64 archive the same way JSZip reads it', async () => {
    const small = toZip64(
      await new JSZip().file('a.json', JSON.stringify(raw)).generateAsync({ type: 'uint8array' }),
    )
    expect(zipDirectoryEntries(small, 1000)).toBe(1)
    expect(Object.keys((await JSZip.loadAsync(small)).files)).toEqual(['a.json'])
    const report = await prepareUploadFiles([new File([small], 'zip64.zip')])
    expect(report.rejected).toEqual([])
    expect(await report.items[0].extract()).toEqual(raw)

    await expectRefusedBeforeParsing(
      new File([toZip64(await manyEntries((i) => `${i}.json`))], 'big64.zip'),
    )
  })

  it('refuses a ZIP64 locator offset that JSZip would truncate to a different directory (GPT, 2026-10-11)', async () => {
    // The locator's offset has 2³² added. JSZip reads it with 32-bit arithmetic, so it lands on the REAL
    // ZIP64 record and parses all 1,001 entries. An exact read lands nowhere, falls back to the LAST
    // ZIP64 record — a decoy in the end record's comment, describing an empty directory — and counted 0.
    const decoy = new Uint8Array(56)
    const d = new DataView(decoy.buffer)
    d.setUint32(0, 0x06064b50, true)
    d.setBigUint64(4, 44n, true)
    const forged = toZip64(await manyEntries((i) => `${i}.json`), {
      locatorDelta: 2n ** 32n,
      comment: decoy,
    })
    // The disagreement is real: JSZip itself parses every entry of this archive.
    expect(Object.keys((await JSZip.loadAsync(forged)).files).length).toBeGreaterThan(1000)
    expect(zipDirectoryEntries(forged, 1000)).toBeNull()
    const load = vi.spyOn(JSZip, 'loadAsync')
    try {
      const report = await prepareUploadFiles([new File([forged], 'forged64.zip')])
      expect(report.rejected[0]?.error).toContain('Cannot read ZIP archive')
      expect(report.items).toEqual([])
      expect(load).not.toHaveBeenCalled()
    } finally {
      load.mockRestore()
    }
  })

  it('counts an archive with bytes prepended (a self-extracting stub) as JSZip does', async () => {
    const prefixed = (zip: Uint8Array) => {
      const out = new Uint8Array(100 + zip.length)
      out.fill(0x20, 0, 100)
      out.set(zip, 100)
      return out
    }
    const small = prefixed(
      await new JSZip().file('a.json', JSON.stringify(raw)).generateAsync({ type: 'uint8array' }),
    )
    expect(zipDirectoryEntries(small, 1000)).toBe(1)
    const report = await prepareUploadFiles([new File([small], 'stub.zip')])
    expect(report.rejected).toEqual([])
    expect(await report.items[0].extract()).toEqual(raw)
    await expectRefusedBeforeParsing(
      new File([prefixed(await manyEntries((i) => `${i}.json`))], 'stub-big.zip'),
    )
  })

  it('accepts an archive the size of a real export: hundreds of lesson plans', async () => {
    // The 2026-10-11 export was 95 JSON files; ~20 MB archives are expected (~255 files). The first
    // limit (50 per upload) rejected even today's archive.
    const zip = new JSZip()
    for (let i = 0; i < 260; i++) zip.file(`lessons/${i}.json`, JSON.stringify(raw))
    const report = await prepareUploadFiles([await archive(zip)])
    expect(report.rejected).toEqual([])
    expect(report.items).toHaveLength(260)
    expect(await report.items[259].extract()).toEqual(raw)
  })

  it('bounds the JSON expanded across one whole upload, not only per file', async () => {
    // Each entry is under the per-file limit; together they exceed the upload's expanded budget. The
    // budget is scaled down here (production: MAX_EXPANDED_BYTES) so the test needs no 200 MB archive.
    expect(MAX_EXPANDED_BYTES).toBe(200 * 1024 * 1024)
    const budget = 64 * 1024
    const zip = new JSZip()
    // VALID JSON (trailing whitespace is legal): an invalid entry would be refused for that reason, and
    // the test would pass without the budget doing anything (caught by mutation, 2026-10-11).
    for (let i = 0; i < 5; i++) zip.file(`${i}.json`, JSON.stringify(raw) + ' '.repeat(20 * 1024))
    await expect(
      prepareUploadFiles([await archive(zip)], { expandedBytes: budget }),
    ).rejects.toThrow(`more than ${budget} bytes of JSON`)
    // Standalone files count against the same budget.
    const big = new File([' '.repeat(40 * 1024)], 'a.json')
    const other = new File([' '.repeat(40 * 1024)], 'b.json')
    await expect(prepareUploadFiles([big, other], { expandedBytes: budget })).rejects.toThrow(
      'bytes of JSON',
    )
  })

  it('reads each archive completely before the next, so none stays open for the import', async () => {
    const files = [
      await archive(new JSZip().file('a.json', JSON.stringify(raw)), 'one.zip'),
      await archive(new JSZip().file('b.json', JSON.stringify(raw)), 'two.zip'),
    ]
    // Every JSON entry has been streamed by the time preparation returns. A lazy reader — one that
    // streamed only when the import later called `extract` — would keep each archive alive until then.
    const entryProto = Object.getPrototypeOf(new JSZip().file('x.json', '{}').file('x.json')!)
    const streamed: string[] = []
    const nodeStream = entryProto.nodeStream
    entryProto.nodeStream = function (this: { name: string }, ...args: unknown[]) {
      streamed.push(this.name)
      return nodeStream.apply(this, args)
    }
    let report: Awaited<ReturnType<typeof prepareUploadFiles>>
    try {
      report = await prepareUploadFiles(files)
      expect(streamed).toEqual(['a.json', 'b.json'])
    } finally {
      entryProto.nodeStream = nodeStream
    }
    expect(await Promise.all(report.items.map((item) => item.extract()))).toEqual([raw, raw])
  })

  it('enforces the combined JSON count across standalone uploads and archives', async () => {
    const zip = new JSZip()
    for (let i = 0; i < MAX_FILES; i++) zip.file(`${i}.json`, JSON.stringify(raw))
    await expect(
      prepareUploadFiles([await archive(zip), new File(['{}'], 'extra.json')]),
    ).rejects.toThrow('Too many JSON files')
  })
})

describe('LESSONS.json envelope', () => {
  it('does not parse unknown kinds, checks checksums and reports absent and unlisted files', async () => {
    const manifest = {
      format: 1,
      release: { id: 'Nov', date: '2026-11-14' },
      schemaVersion: '1.0.0',
      minProgram: '1.08',
      files: {
        'lesson.json': { sha256: '0'.repeat(64) },
        'quiz.json': { sha256: '0'.repeat(64), kind: 'quiz' },
        'missing.json': { sha256: '0'.repeat(64), kind: 'lesson-plan' },
      },
    }
    const zip = new JSZip()
      .file('LESSONS.json', JSON.stringify(manifest))
      .file('lesson.json', JSON.stringify(raw))
      .file('quiz.json', 'This is not JSON and must not be parsed')
      .file('extra.json', JSON.stringify(raw))
    const report = await prepareUploadFiles([
      new File([await zip.generateAsync({ type: 'arraybuffer' })], 'set.zip'),
    ])
    expect(report.items).toHaveLength(2)
    expect(report.items[0].release).toEqual(manifest.release)
    // Reported once, in the set's warnings (not again on the item).
    expect(report.items[0].warnings).toBeUndefined()
    expect(report.warnings).toContainEqual({
      file: 'set.zip/lesson.json',
      error: expect.stringMatching(/Looks damaged/),
    })
    expect(report.waitingForProgram).toHaveLength(1)
    expect(report.warnings).toHaveLength(4)
    expect(report.rejected).toEqual([])
  })
  it('refuses only the malformed set before any of its files are prepared', async () => {
    const zip = new JSZip().file('LESSONS.json', '{').file('lesson.json', JSON.stringify(raw))
    const report = await prepareUploadFiles([
      new File([await zip.generateAsync({ type: 'arraybuffer' })], 'bad.zip'),
      new File([JSON.stringify(raw)], 'good.json'),
    ])
    expect(report.setRefused).toHaveLength(1)
    expect(report.items.map((i) => i.name)).toEqual(['good.json'])
  })
})
