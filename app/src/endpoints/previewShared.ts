/**
 * Shared rendering for the version content-preview endpoints (SPEC §5) — the page shell, CSP
 * headers, completeness gate, error semantics (`renderPreviewResponse`), and the unsaved-POST body
 * parse (`parsePreviewCandidate`). Factored out of `previewVersion.ts` so the GET (saved) and POST
 * (unsaved) verbs cannot drift on what a preview looks like, how an incomplete/failed render is
 * reported, or how the posted `data` field is validated.
 */
import { APIError, type PayloadRequest } from 'payload'

import { renderBundlePreview, type PreviewSection } from '../generator/previewBundle'
import { renderVersionSectionsCached } from '../generator/htmlSectionsCache'
import { annotateLessonAnchors, docSectionId } from '../lib/lessonAnchors'
import { validateGeneratable } from '../ingest/validateGeneratable'
import type { LessonBundleVersion } from '../payload-types'

// The unsaved-POST body parse lives in its own generator-free module so it can be unit tested
// without booting the docx/mammoth chain. Re-exported here so existing import sites are unchanged.
export { parsePreviewCandidate, MAX_PREVIEW_JSON_BYTES } from './previewParse'

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Wrap the rendered sections in a minimal, self-contained, script-free HTML page. */
function previewPage(
  title: string,
  sections: PreviewSection[],
  unsaved: boolean,
): string {
  // In-page navigation (critique 2026-07-12), shared shape with the lesson detail page: inject
  // per-lesson anchor ids (a pure string transform on already-sanitized HTML) and build a sticky,
  // CSS-only jump nav — this page is script-free by CSP, and anchors need no script.
  const annotated = sections.map((s) => {
    const { html, anchors } = annotateLessonAnchors(s.html)
    return { label: s.label, html, anchors }
  })
  const nav = annotated
    .map((s) => {
      // Label-based, matching the lesson page exactly (one cross-surface contract): the Lesson
      // Sequence's link reads "Overview" even if no lesson anchors matched.
      const isSequence = s.label === 'Lesson Sequence'
      const sectionLink = `<a href="#${docSectionId(s.label)}">${escapeHtml(isSequence ? 'Overview' : s.label)}</a>`
      const lessonLinks = s.anchors
        .map(
          (a) =>
            `<a class="doc-nav-lesson" href="#${a.id}" title="Lesson ${a.number}: ${escapeHtml(a.title)}">${a.number}</a>`,
        )
        .join('')
      return isSequence && s.anchors.length > 0
        ? `${sectionLink}<span class="doc-nav-label">Lessons</span>${lessonLinks}`
        : sectionLink
    })
    .join('')
  const body = annotated
    .map(
      (s) =>
        `<section class="doc-section" id="${docSectionId(s.label)}"><h2>${escapeHtml(s.label)}</h2><div class="doc">${s.html}</div></section>`,
    )
    .join('\n')
  // POST previews render the in-editor form state, which may differ from what's stored.
  const provenance = unsaved ? 'unsaved edits' : 'latest saved version'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Preview — ${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  .page-head { color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0.2rem 0 1.5rem; }
  .doc-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; flex-wrap: wrap;
    gap: 0.25rem 0.35rem; padding: 0.45rem 0; background: #fff; border-bottom: 1px solid #ddd; font-size: 0.85rem; }
  .doc-nav a { text-decoration: none; color: #1f5fa8; padding: 0.2rem 0.5rem; border-radius: 6px; }
  .doc-nav a:hover, .doc-nav a:focus-visible { background: rgba(31, 95, 168, 0.1); }
  .doc-nav-label { color: #666; margin-left: 0.35rem; }
  .doc-nav-lesson { min-width: 1.7rem; text-align: center; border: 1px solid #ddd; }
  .doc-section, [id^='lesson-'] { scroll-margin-top: 3.5rem; }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
  .doc-section + .doc-section { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 2px solid #ddd; }
  .doc-section h2 { color: #666; font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .doc { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  td, th { border: 1px solid #ccc; padding: 0.4rem 0.55rem; vertical-align: top; text-align: left; }
</style></head>
<body>
  <p class="page-head">Content preview · ${escapeHtml(provenance)} · not the final document layout</p>
  <h1>${escapeHtml(title)}</h1>
  <nav class="doc-nav" aria-label="Jump to section">${nav}</nav>
  ${body}
</body></html>`
}

/**
 * Shared response headers: a script-free, self-contained HTML page (no external loads). The strict
 * standalone CSP survives because `next.config.ts` excludes the preview path from its baseline CSP
 * rule (a next.config CSP would otherwise override this Response CSP). `frame-ancestors 'none'` is
 * explicit — `default-src` does not cover it — so the preview is anti-clickjacking on the CSP layer too.
 */
export const PREVIEW_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
} as const

/**
 * Validate completeness → render → wrap → respond. Shared by every preview verb so the saved and
 * unsaved paths cannot drift on gating, error semantics, or CSP. Distinguishes an EXPECTED
 * incomplete draft (422, with the specific reasons) from an UNEXPECTED render failure (500);
 * `validateGeneratable` is the same completeness gate the publish/version hooks use.
 */
export async function renderPreviewResponse(
  req: PayloadRequest,
  bundle: LessonBundleVersion,
  unsaved: boolean,
): Promise<Response> {
  const problems = validateGeneratable(bundle)
  if (problems.length > 0) {
    const fix = unsaved ? 'fill in' : 'fill in and save'
    throw new APIError(`This lesson plan can’t be previewed yet — ${fix}: ${problems.join(' ')}`, 422)
  }

  let sections: PreviewSection[]
  try {
    // SAVED preview → cache by the immutable version id (Phase 3), shared with the lesson page.
    // UNSAVED preview renders caller-submitted working-copy content and must never be cached.
    sections = unsaved
      ? await renderBundlePreview(bundle)
      : await renderVersionSectionsCached(req.payload, bundle.id)
  } catch (err) {
    // Completeness already passed, so a throw here is a real generator/converter failure,
    // not an incomplete draft — log it and surface a 500 instead of masking it as "not ready".
    req.payload.logger.error({ err, docId: bundle.id }, 'preview render failed')
    throw new APIError('Could not render this preview.', 500)
  }

  const html = previewPage(bundle.title ?? 'Lesson plan', sections, unsaved)
  return new Response(html, { status: 200, headers: PREVIEW_HEADERS })
}
