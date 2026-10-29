/**
 * `docxToPdf` error classification (audit F-C42-002). The timeout signal also covers reading the
 * response BODY, and that read used to sit outside the `PdfConversionError` wrapper — so a converter
 * that sent success headers and then stalled escaped as a raw TimeoutError, which the preview
 * endpoint reports as a generator failure (500) instead of a converter one (502).
 *
 * A real local HTTP server and Node's own fetch, because the defect lives in where fetch rejects.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { docxToPdf, PdfConversionError } from '../../src/generator/docxToPdf'

let server: Server
const saved = { url: process.env.GOTENBERG_URL, timeout: process.env.GOTENBERG_TIMEOUT_MS }

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      if (req.url?.startsWith('/stall-body')) {
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': '100' })
        res.write('%PDF-') // headers and a partial body, then nothing
        return
      }
      res.writeHead(200, { 'content-type': 'application/pdf' })
      res.end('%PDF-1.7 ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  process.env.GOTENBERG_URL = saved.url
  process.env.GOTENBERG_TIMEOUT_MS = saved.timeout
  if (saved.url === undefined) delete process.env.GOTENBERG_URL
  if (saved.timeout === undefined) delete process.env.GOTENBERG_TIMEOUT_MS
})

const at = (path: string) => {
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`
  process.env.GOTENBERG_TIMEOUT_MS = '200'
}

describe('docxToPdf classifies a converter that stalls mid-body as a converter failure', () => {
  it('returns the body of a complete response', async () => {
    at('/ok')
    await expect(docxToPdf(Buffer.from('docx'))).resolves.toEqual(Buffer.from('%PDF-1.7 ok'))
  })

  it('wraps a timeout AFTER the headers in PdfConversionError', async () => {
    at('/stall-body')
    await expect(docxToPdf(Buffer.from('docx'))).rejects.toBeInstanceOf(PdfConversionError)
  })
})
