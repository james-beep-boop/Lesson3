/**
 * Unit coverage for `sanitizePreviewHtml` (hardening backlog #3) — the DOMPurify+jsdom sanitizer
 * applied at the `docxToSections` seam before preview HTML is rendered with `dangerouslySetInnerHTML`.
 * Asserts the dangerous constructs are stripped and the safe Mammoth content subset is preserved.
 */
import { describe, it, expect } from 'vitest'

import { sanitizePreviewHtml } from '../../src/lib/sanitizeHtml.js'

describe('sanitizePreviewHtml', () => {
  it('removes <script> elements', () => {
    const out = sanitizePreviewHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).toContain('<p>ok</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('strips inline event-handler attributes', () => {
    const out = sanitizePreviewHtml('<p onclick="steal()">hi</p><img src=x onerror="hack()">')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
    expect(out).toContain('hi')
  })

  it('drops javascript: and data: link schemes but keeps the text', () => {
    const js = sanitizePreviewHtml('<a href="javascript:alert(1)">click</a>')
    expect(js).not.toContain('javascript:')
    expect(js).toContain('click')
    const data = sanitizePreviewHtml('<a href="data:text/html,<script>1</script>">x</a>')
    expect(data).not.toContain('data:')
    expect(data).toContain('x')
  })

  it('keeps safe http(s)/mailto/anchor links', () => {
    expect(sanitizePreviewHtml('<a href="https://ares.org">x</a>')).toContain('href="https://ares.org"')
    expect(sanitizePreviewHtml('<a href="mailto:a@b.org">x</a>')).toContain('href="mailto:a@b.org"')
    expect(sanitizePreviewHtml('<a href="#sec">x</a>')).toContain('href="#sec"')
  })

  it('preserves the Mammoth content subset: tables, headings, lists, emphasis', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> <em>it</em></p>' +
      '<ul><li>one</li></ul>' +
      '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('<h2>Title</h2>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>it</em>')
    expect(out).toContain('<li>one</li>')
    expect(out).toContain('<td colspan="2">cell</td>')
  })

  it('strips style/class/id attributes (not on the allowlist)', () => {
    const out = sanitizePreviewHtml('<p class="x" id="y" style="color:red">t</p>')
    expect(out).not.toContain('class=')
    expect(out).not.toContain('style=')
    expect(out).not.toContain('id=')
    expect(out).toContain('t')
  })
})
