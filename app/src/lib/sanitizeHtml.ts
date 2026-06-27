/**
 * Server-side HTML sanitizer for the content-preview path (SPEC §5; hardening backlog #3).
 *
 * The preview pipeline converts a generated DOCX to HTML with Mammoth and renders it via
 * `dangerouslySetInnerHTML` on the teacher route AND as a standalone page from the preview endpoint.
 * Today the inputs are plain strings (Mammoth escapes text), so nothing executable can appear — but
 * that guarantee is thin and breaks the moment richer imported content or resource links land. This
 * sanitizes at the single seam (`docxToSections`) so BOTH render sites get clean HTML; it is defence
 * in depth alongside the frontend security headers (next.config) and the endpoint's own CSP.
 *
 * DOMPurify (battle-tested against mutation-XSS) over a hand-rolled allowlist, run against the
 * already-vendored jsdom. The allowlist is the safe subset Mammoth emits for our content: block
 * paragraphs, inline emphasis, headings, lists, links, and tables — nothing that can script.
 */
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

// One jsdom window for the process — DOMPurify needs a DOM to parse into; it is small and reused.
const { window } = new JSDOM('')
const DOMPurify = createDOMPurify(window)

const PREVIEW_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span',
    'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a',
  ],
  // Only structural/link attributes — no style/class/id, no event handlers (on*).
  ALLOWED_ATTR: ['href', 'colspan', 'rowspan'],
  ALLOW_DATA_ATTR: false,
  // Link schemes: rely on DOMPurify's DEFAULT URI validation, which already strips javascript:/data:
  // while keeping http(s)/mailto/relative/anchors. A custom ALLOWED_URI_REGEXP here over-applies to
  // non-URI attributes (it silently strips colspan/rowspan), so we deliberately do NOT set one.
}

/** Sanitize Mammoth-generated preview HTML down to the safe content subset. Returns a string. */
export function sanitizePreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, PREVIEW_SANITIZE_CONFIG)
}
