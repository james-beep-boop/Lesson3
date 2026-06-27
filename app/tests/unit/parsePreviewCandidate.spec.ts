/**
 * Unit coverage for `parsePreviewCandidate` (the unsaved-preview POST body parse) — the 400/413
 * HTTP/form semantics that the Local-API `verify-stage2b-preview` path bypasses (cutover follow-up,
 * NEXT-SESSION). Pure: drives the parser with a mocked PayloadRequest, asserting the APIError status.
 */
import { describe, it, expect, vi } from 'vitest'

// Stub `payload` so importing the parser does NOT pull the heavy payload barrel into the DB-free
// unit env. The parser only needs APIError to carry a `status`; this mirrors Payload's APIError.
vi.mock('payload', () => ({
  APIError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

import { parsePreviewCandidate } from '../../src/endpoints/previewParse.js'

/** Build a fake PayloadRequest whose `formData()` resolves to `fd` (or rejects when `fd` is null).
 *  Optionally stub a Content-Length header to exercise the pre-parse guard. */
const reqWith = (fd: FormData | null, contentLength?: number) =>
  ({
    headers: { get: (k: string) => (k === 'content-length' && contentLength != null ? String(contentLength) : null) },
    formData: async () => {
      if (fd === null) throw new Error('not a form post')
      return fd
    },
  }) as never

const form = (entries: Record<string, string>): FormData => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const status = async (req: never): Promise<number | undefined> => {
  try {
    await parsePreviewCandidate(req)
    return undefined // resolved — no error
  } catch (e) {
    return (e as { status?: number }).status
  }
}

describe('parsePreviewCandidate', () => {
  it('400 when the body is not a form post', async () => {
    expect(await status(reqWith(null))).toBe(400)
  })

  it('400 when the "data" field is missing', async () => {
    expect(await status(reqWith(form({})))).toBe(400)
  })

  it('413 (pre-parse) when Content-Length exceeds the body cap, before reading the body', async () => {
    let read = false
    const req = {
      // Above the whole-body cap (field cap + framing overhead), so the pre-guard fires.
      headers: { get: (k: string) => (k === 'content-length' ? '5000000' : null) },
      formData: async () => {
        read = true
        return form({ data: '{}' })
      },
    } as never
    expect(await status(req)).toBe(413)
    expect(read).toBe(false) // rejected before buffering the body
  })

  it('does NOT pre-reject a near-limit body: Content-Length just over the field cap still parses', async () => {
    // A valid `data` field just under 4 MB + multipart framing can exceed MAX_PREVIEW_JSON_BYTES in
    // total length; the body cap's overhead allowance must let it through to the precise field check.
    const out = await parsePreviewCandidate(reqWith(form({ data: '{"ok":true}' }), 4_010_000))
    expect(out).toEqual({ ok: true })
  })

  it('413 when the parsed "data" field exceeds the byte cap', async () => {
    const huge = 'x'.repeat(4_000_001)
    expect(await status(reqWith(form({ data: huge })))).toBe(413)
  })

  it('400 when "data" is not valid JSON', async () => {
    expect(await status(reqWith(form({ data: '{not json' })))).toBe(400)
  })

  it('400 when "data" is valid JSON but not an object', async () => {
    expect(await status(reqWith(form({ data: '[1,2,3]' })))).toBe(400)
    expect(await status(reqWith(form({ data: '"a string"' })))).toBe(400)
  })

  it('returns the parsed object for a valid body', async () => {
    const out = await parsePreviewCandidate(reqWith(form({ data: '{"title":"ok"}' })))
    expect(out).toEqual({ title: 'ok' })
  })
})
