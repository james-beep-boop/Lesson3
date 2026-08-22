import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  decodePdfToken,
  encodePdfToken,
  listPdfFiles,
  readPdfFile,
} from '../../src/endpoints/resourceLibrary'

const temporaryDirectories: string[] = []

const directory = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'lesson3-pdf-library-'))
  temporaryDirectories.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true })))
})

describe('PDF resource library boundary', () => {
  it('round-trips an ordinary filename but rejects paths and non-PDF tokens', () => {
    const token = encodePdfToken('Motion and Forces.pdf')
    expect(decodePdfToken(token)).toBe('Motion and Forces.pdf')
    expect(decodePdfToken(encodePdfToken('../secret.pdf'))).toBeNull()
    expect(decodePdfToken(encodePdfToken('notes.txt'))).toBeNull()
  })

  it('lists only regular PDFs and sorts their display names', async () => {
    const root = await directory()
    await writeFile(path.join(root, 'Zulu.pdf'), '%PDF-1.4\nZulu')
    await writeFile(path.join(root, 'alpha.PDF'), '%PDF-1.4\nAlpha')
    await writeFile(path.join(root, 'notes.txt'), 'not a PDF')
    await writeFile(path.join(root, '.hidden.pdf'), '%PDF-1.4\nhidden')
    await symlink(path.join(root, 'Zulu.pdf'), path.join(root, 'linked.pdf'))

    expect((await listPdfFiles(root)).map((file) => file.name)).toEqual(['alpha.PDF', 'Zulu.pdf'])
  })

  it('serves a signature-verified PDF and refuses renamed content or a symlink', async () => {
    const root = await directory()
    await writeFile(path.join(root, 'good.pdf'), '%PDF-1.7\nexample')
    await writeFile(path.join(root, 'fake.pdf'), '<script>not pdf</script>')
    await symlink(path.join(root, 'good.pdf'), path.join(root, 'linked.pdf'))

    const good = await readPdfFile(root, encodePdfToken('good.pdf'))
    expect(good.kind).toBe('found')
    if (good.kind === 'found') expect(good.bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await readPdfFile(root, encodePdfToken('fake.pdf'))).kind).toBe('not-found')
    expect((await readPdfFile(root, encodePdfToken('linked.pdf'))).kind).toBe('not-found')
  })
})
