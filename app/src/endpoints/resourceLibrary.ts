/**
 * Read-only proof-of-concept PDF library.
 *
 * The browser must never browse the Rock's filesystem directly. These two authenticated endpoints
 * expose only ordinary `.pdf` files from one configured, flat directory:
 *
 *   GET /api/resource-library              list safe PDF names
 *   GET /api/resource-library/file/:token serve one listed PDF
 *
 * The token is an encoded filename, not a client-supplied path. Listing excludes directories,
 * symlinks, hidden files, non-PDF extensions and oversized files. Serving repeats every check,
 * opens with O_NOFOLLOW, verifies the PDF signature and never accepts a slash/backslash. This is a
 * deliberately small library, not file management: the app cannot upload, rename or delete files.
 */
import { constants as fsConstants } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import type { Endpoint, PayloadRequest } from 'payload'

export const MAX_RESOURCE_PDF_BYTES = 25 * 1024 * 1024

export type PdfResource = {
  href: string
  name: string
  size: number
}

type PdfFile = {
  name: string
  size: number
  token: string
}

export type ReadPdfResult =
  | { kind: 'found'; bytes: Buffer; name: string }
  | { kind: 'not-found' }
  | { kind: 'too-large' }

const isSafePdfName = (name: string): boolean =>
  name.length > 0 &&
  !name.startsWith('.') &&
  path.extname(name).toLowerCase() === '.pdf' &&
  path.basename(name) === name &&
  !name.includes('/') &&
  !name.includes('\\') &&
  !name.includes('\0')

export const encodePdfToken = (name: string): string =>
  Buffer.from(name, 'utf8').toString('base64url')

export const decodePdfToken = (token: string): string | null => {
  try {
    const name = Buffer.from(token, 'base64url').toString('utf8')
    return encodePdfToken(name) === token && isSafePdfName(name) ? name : null
  } catch {
    return null
  }
}

/** List only regular, small PDF files. Dirent.isFile() deliberately excludes symlinks. */
export async function listPdfFiles(root: string): Promise<PdfFile[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isSafePdfName(entry.name))
      .map(async (entry): Promise<PdfFile | null> => {
        const info = await stat(path.join(root, entry.name))
        if (!info.isFile() || info.size > MAX_RESOURCE_PDF_BYTES) return null
        return { name: entry.name, size: info.size, token: encodePdfToken(entry.name) }
      }),
  )
  return files
    .filter((file): file is PdfFile => file !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/**
 * Open one token-resolved PDF without following a final-component symlink. The signature check
 * prevents an arbitrary file renamed to `.pdf` from being served as active browser content.
 */
export async function readPdfFile(root: string, token: string): Promise<ReadPdfResult> {
  const name = decodePdfToken(token)
  if (!name) return { kind: 'not-found' }

  const rootPath = path.resolve(root)
  const filePath = path.resolve(rootPath, name)
  if (path.dirname(filePath) !== rootPath) return { kind: 'not-found' }

  let handle
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile()) return { kind: 'not-found' }
    if (info.size > MAX_RESOURCE_PDF_BYTES) return { kind: 'too-large' }
    const bytes = await handle.readFile()
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') return { kind: 'not-found' }
    return { kind: 'found', bytes, name }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR') return { kind: 'not-found' }
    throw error
  } finally {
    await handle?.close()
  }
}

const unauthorized = (): Response =>
  Response.json({ error: 'You must be signed in.' }, { status: 401 })

const notFound = (): Response => Response.json({ error: 'PDF not found.' }, { status: 404 })

const configuredRoot = (): string => process.env.PDF_LIBRARY_DIR?.trim() ?? ''

const logUnavailable = (req: PayloadRequest, error: unknown): void => {
  req.payload.logger.error({ err: error }, 'PDF resource library unavailable')
}

export const resourceLibraryListEndpoint: Endpoint = {
  path: '/resource-library',
  method: 'get',
  handler: async (req) => {
    if (!req.user) return unauthorized()

    const root = configuredRoot()
    if (!root) return Response.json({ configured: false, files: [] })

    try {
      const files = (await listPdfFiles(root)).map<PdfResource>(({ name, size, token }) => ({
        name,
        size,
        href: `/api/resource-library/file/${token}`,
      }))
      return Response.json({ configured: true, files })
    } catch (error) {
      logUnavailable(req, error)
      return Response.json({ error: 'The PDF library is unavailable.' }, { status: 503 })
    }
  },
}

export const resourceLibraryFileEndpoint: Endpoint = {
  path: '/resource-library/file/:token',
  method: 'get',
  handler: async (req) => {
    if (!req.user) return unauthorized()

    const root = configuredRoot()
    const token = req.routeParams?.token
    if (!root || typeof token !== 'string') return notFound()

    try {
      const result = await readPdfFile(root, token)
      if (result.kind === 'not-found') return notFound()
      if (result.kind === 'too-large') {
        return Response.json({ error: 'PDF is too large for this demonstration.' }, { status: 413 })
      }

      const encodedName = encodeURIComponent(result.name).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      )
      return new Response(new Uint8Array(result.bytes), {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
          'Content-Length': String(result.bytes.length),
          'Content-Type': 'application/pdf',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      logUnavailable(req, error)
      return Response.json({ error: 'The PDF library is unavailable.' }, { status: 503 })
    }
  },
}
