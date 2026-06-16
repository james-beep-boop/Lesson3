/**
 * Preview endpoint (SPEC §5 content-preview tier) — view a bundle's generated documents
 * as HTML in the browser. Companion to the export endpoint, with two deliberate differences:
 *
 *   - DRAFT-CAPABLE: reads the latest (draft) snapshot (`findReadableBundle(draft:true)`),
 *     so an Editor can preview in-progress work before publishing. It is NOT published-only.
 *   - HTML, NOT a download: returns a self-contained `text/html` page (mammoth content view),
 *     never DOCX bytes — so it can never be an export bypass.
 *
 * Mounted on the lesson-bundles collection → `GET /api/lesson-bundles/:id/preview`.
 * Query: `?format=standard|compact` (LessonSequence layout; FE/ST are identical).
 *
 * SECURITY: authorization is enforced HERE (the caller's own READ access via
 * `findReadableBundle` — `overrideAccess:false` + `user`), exactly like the export endpoint.
 * A Teacher only matches published bundles, so a draft is "not found" (404) for them; an
 * Editor matches drafts within their subject-grades. Only then do we render.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { renderBundlePreview, type PreviewSection } from '../generator/previewBundle'
import { parseLessonSequenceFormat } from './parseFormat'
import { validateGeneratable } from '../ingest/validateGeneratable'
import { findReadableBundle } from '../lib/readBundle'
import type { User } from '../payload-types'

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Wrap the rendered sections in a minimal, self-contained, script-free HTML page. */
function previewPage(title: string, format: string, sections: PreviewSection[]): string {
  const body = sections
    .map(
      (s) =>
        `<section class="doc-section"><h2>${escapeHtml(s.label)}</h2><div class="doc">${s.html}</div></section>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Preview — ${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  .page-head { color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0.2rem 0 1.5rem; }
  .doc-section + .doc-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 2px solid #ddd; }
  .doc-section h2 { color: #666; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .doc { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  td, th { border: 1px solid #ccc; padding: 0.4rem 0.55rem; vertical-align: top; text-align: left; }
</style></head>
<body>
  <p class="page-head">Content preview · ${escapeHtml(format)} · not the final document layout</p>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body></html>`
}

export const previewBundleEndpoint: Endpoint = {
  path: '/:id/preview',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)

    const format = parseLessonSequenceFormat(req)

    // Authorization + draft read: a non-readable bundle is "not found" for this user.
    const bundle = await findReadableBundle(req.payload, {
      id,
      user: req.user as User,
      req,
      draft: true,
    })
    if (!bundle) throw new APIError('Bundle not found', 404)

    // Distinguish an EXPECTED incomplete draft (422, with the specific reasons) from an
    // UNEXPECTED render failure (500). `validateGeneratable` is the same completeness gate
    // the publish hook uses, so the preview reports exactly what publishing would block on.
    const problems = validateGeneratable(bundle)
    if (problems.length > 0) {
      throw new APIError(
        `This draft can’t be previewed yet — fill in and save: ${problems.join(' ')}`,
        422,
      )
    }

    let sections: PreviewSection[]
    try {
      sections = await renderBundlePreview(bundle, format)
    } catch (err) {
      // Completeness already passed, so a throw here is a real generator/converter failure,
      // not an incomplete draft — log it and surface a 500 instead of masking it as "not ready".
      req.payload.logger.error({ err, bundleId: bundle.id }, 'preview render failed')
      throw new APIError('Could not render this preview.', 500)
    }

    const html = previewPage(bundle.title ?? 'Lesson bundle', format, sections)
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Hardening: the page needs only its own inline styles — no scripts, no external loads.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
}
