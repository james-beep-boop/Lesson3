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
 * the engine can be swapped if the fidelity test (scripts/pdf-fidelity-check.ts) favours
 * another without touching the export path.
 */

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
    new Blob([new Uint8Array(docx)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    filename.endsWith('.docx') ? filename : `${filename}.docx`,
  )

  const base = gotenbergUrl()
  let res: Response
  try {
    res = await fetch(`${base}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
    })
  } catch (err) {
    throw new PdfConversionError(`PDF converter unreachable at ${base}: ${(err as Error).message}`)
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500)
    throw new PdfConversionError(
      `PDF converter returned ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`,
    )
  }

  return Buffer.from(await res.arrayBuffer())
}
