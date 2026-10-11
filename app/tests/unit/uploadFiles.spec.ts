import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { MAX_FILE_BYTES, MAX_ZIP_BYTES, prepareUploadFiles } from '../../src/ingest/uploadFiles'

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

  it('rejects archives with too many entries without reading their contents', async () => {
    const zip = new JSZip()
    for (let i = 0; i < 1001; i++) zip.file(`${i}.txt`, 'notes')
    const report = await prepareUploadFiles([await archive(zip)])
    expect(report.rejected[0].error).toContain('Too many ZIP entries')
    expect(report.items).toEqual([])
    expect(report.skipped).toEqual([])
  })

  it('enforces the combined JSON count across standalone uploads and archives', async () => {
    const zip = new JSZip()
    for (let i = 0; i < 50; i++) zip.file(`${i}.json`, JSON.stringify(raw))
    await expect(
      prepareUploadFiles([await archive(zip), new File(['{}'], 'extra.json')]),
    ).rejects.toThrow('Too many JSON files')
  })
})
