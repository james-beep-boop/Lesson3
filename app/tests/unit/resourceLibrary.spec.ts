import { mkdtemp, open, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_RESOURCE_PDF_BYTES,
  decodePdfToken,
  encodePdfToken,
  listPdfFiles,
  readPdfFile,
  resourceLibraryFileEndpoint,
  resourceLibraryListEndpoint,
} from '../../src/endpoints/resourceLibrary'

const temporaryDirectories: string[] = []

const directory = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'lesson3-pdf-library-'))
  temporaryDirectories.push(root)
  return root
}

afterEach(async () => {
  vi.unstubAllEnvs()
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
    if (good.kind === 'found')
      expect(await new Response(good.body).text()).toBe('%PDF-1.7\nexample')
    expect((await readPdfFile(root, encodePdfToken('fake.pdf'))).kind).toBe('not-found')
    expect((await readPdfFile(root, encodePdfToken('linked.pdf'))).kind).toBe('not-found')
  })
})

describe('PDF access independently of public discovery', () => {
  it.each(['', '0', '1'])(
    'serves configured PDFs anonymously with discovery=%s; keeps listing private',
    async (discovery) => {
      const root = await directory()
      await writeFile(path.join(root, 'public.pdf'), '%PDF-1.7\nexample')
      vi.stubEnv('PDF_LIBRARY_DIR', root)
      vi.stubEnv('PDF_LIBRARY_PUBLIC', '1')
      vi.stubEnv('PUBLIC_LIBRARY_ENABLED', discovery)
      const req = { routeParams: { token: encodePdfToken('public.pdf') } } as never
      const response = await resourceLibraryFileEndpoint.handler(req)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/pdf')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(await response.text()).toBe('%PDF-1.7\nexample')
      expect((await resourceLibraryListEndpoint.handler(req)).status).toBe(401)
    },
  )

  it.each([undefined, '', '0', 'true', 'yes', ' 1'])(
    'an inherited folder stays authenticated with publication=%j',
    async (publication) => {
      const root = await directory()
      await writeFile(path.join(root, 'private.pdf'), '%PDF-1.7\nprivate')
      vi.stubEnv('PDF_LIBRARY_DIR', root)
      vi.stubEnv('PDF_LIBRARY_PUBLIC', publication)
      vi.stubEnv('PUBLIC_LIBRARY_ENABLED', '1')
      const routeParams = { token: encodePdfToken('private.pdf') }
      expect((await resourceLibraryFileEndpoint.handler({ routeParams } as never)).status).toBe(401)
      const signedIn = await resourceLibraryFileEndpoint.handler({
        routeParams,
        user: { id: 1 },
      } as never)
      expect(signedIn.status).toBe(200)
      expect(await signedIn.text()).toBe('%PDF-1.7\nprivate')
      expect((await resourceLibraryListEndpoint.handler({ routeParams } as never)).status).toBe(401)
    },
  )

  it('returns 404 without a folder, and for malformed anonymous file tokens', async () => {
    vi.stubEnv('PDF_LIBRARY_PUBLIC', '1')
    vi.stubEnv('PDF_LIBRARY_DIR', '')
    expect(
      (
        await resourceLibraryFileEndpoint.handler({
          routeParams: { token: encodePdfToken('public.pdf') },
        } as never)
      ).status,
    ).toBe(404)
    vi.stubEnv('PDF_LIBRARY_DIR', await directory())
    expect(
      (await resourceLibraryFileEndpoint.handler({ routeParams: { token: 'bad' } } as never))
        .status,
    ).toBe(404)
  })
})

describe('anonymous PDF safety checks', () => {
  it('still refuses symlinks, renamed non-PDF content and oversized files', async () => {
    const root = await directory()
    vi.stubEnv('PDF_LIBRARY_DIR', root)
    vi.stubEnv('PDF_LIBRARY_PUBLIC', '1')
    await writeFile(path.join(root, 'fake.pdf'), '<script>not a PDF</script>')
    await symlink(path.join(root, 'fake.pdf'), path.join(root, 'linked.pdf'))
    const large = await open(path.join(root, 'large.pdf'), 'w')
    await large.truncate(MAX_RESOURCE_PDF_BYTES + 1)
    await large.close()
    for (const name of ['fake.pdf', 'linked.pdf']) {
      expect(
        (
          await resourceLibraryFileEndpoint.handler({
            routeParams: { token: encodePdfToken(name) },
          } as never)
        ).status,
      ).toBe(404)
    }
    const response = await resourceLibraryFileEndpoint.handler({
      routeParams: { token: encodePdfToken('large.pdf') },
    } as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'PDF not found.' })
  })
})

describe('bounded PDF streaming', () => {
  it('returns bounded chunks and supports cancelling before the whole PDF is read', async () => {
    const root = await directory()
    await writeFile(path.join(root, 'stream.pdf'), '%PDF-' + 'x'.repeat(256 * 1024))
    const result = await readPdfFile(root, encodePdfToken('stream.pdf'))
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') throw new Error('Expected a stream')
    const reader = result.body.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(first.value?.length).toBeLessThanOrEqual(64 * 1024)
    expect(new TextDecoder().decode(first.value).startsWith('%PDF-')).toBe(true)
    await reader.cancel()
  })

  it('refuses short signatures and high-bit bytes that are not the exact PDF signature', async () => {
    const root = await directory()
    for (const bytes of [Buffer.from('%PDF'), Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad])]) {
      await writeFile(path.join(root, 'short.pdf'), bytes)
      expect((await readPdfFile(root, encodePdfToken('short.pdf'))).kind).toBe('not-found')
    }
  })
})
