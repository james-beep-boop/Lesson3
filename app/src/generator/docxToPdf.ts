/**
 * docxToPdf — the swappable DOCX→PDF conversion seam (SPEC §9).
 *
 * PDF is NOT a parallel renderer: it is the generator's own DOCX run through a local
 * office engine, so the PDF reproduces the approved DOCX layout exactly (the same
 * "one source of layout truth" rule that limits the mammoth view to a content preview).
 *
 * The engine lives in a sidecar container (Gotenberg wrapping headless LibreOffice —
 * faithful, free, fully offline; see docker-compose.yml + SPEC §9). This module is the
 * only place that knows the engine; callers depend on `docxToPdf(buffer) -> buffer`, so
 * the engine can be swapped without touching the export path. (The old pixel-diff gate that
 * would have compared engines, `scripts/pdf-fidelity-check.ts`, was RETIRED 2026-07-20 — its
 * Word-vs-LibreOffice methodology had already been abandoned and its parser was broken. DOCX
 * remains the authoritative layout deliverable; see DECISIONS 2026-07-20.)
 */

import { positiveIntEnv } from '../lib/env'
import { mimeFor } from './exportArtifacts'

/** Thrown when the conversion sidecar is unreachable or returns a non-2xx response. */
export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfConversionError'
  }
}

/** Base URL of the Gotenberg sidecar; internal compose host in production. */
const gotenbergUrl = (): string =>
  (process.env.GOTENBERG_URL || 'http://gotenberg:3000').replace(/\/+$/, '')

/**
 * Convert a single DOCX buffer to a PDF buffer via the Gotenberg LibreOffice route.
 * `filename` only sets the multipart part name the engine sees — it must keep a
 * .docx extension for LibreOffice to pick the right import filter.
 */
export async function docxToPdf(docx: Buffer, filename = 'document.docx'): Promise<Buffer> {
  const form = new FormData()
  // A Blob over a fresh Uint8Array view avoids leaking the Buffer's backing pool.
  form.append(
    'files',
    new Blob([new Uint8Array(docx)], { type: mimeFor('docx') }),
    filename.endsWith('.docx') ? filename : `${filename}.docx`,
  )

  const base = gotenbergUrl()
  // Cap a hung conversion so it can't pin a Node request slot indefinitely (the converter is
  // a separate process; a dead socket would otherwise block forever). This is the floor-level
  // safety net — per-user rate-limiting + a Jobs Queue for the heavy path are the tracked
  // follow-ups. Default sits at the sidecar's own --api-timeout (120s); override via env.
  const timeoutMs = positiveIntEnv('GOTENBERG_TIMEOUT_MS', 120_000)
  let res: Response
  try {
    res = await fetch(`${base}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new PdfConversionError(
      `PDF converter unreachable or timed out at ${base}: ${(err as Error).message}`,
    )
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500)
    throw new PdfConversionError(
      `PDF converter returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`,
    )
  }

  return Buffer.from(await res.arrayBuffer())
}
