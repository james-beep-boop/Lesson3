/**
 * The forum's text rules (`src/lib/discussionText.ts`): safe auto-links (§16.4 "Links in text"),
 * paragraphs, and the reference label the picker and the server must build alike.
 *
 * ⚑ THE LOAD-BEARING CASES: only http(s) becomes a link — `javascript:` and markup stay text — and
 * sentence punctuation after a URL is not swallowed into it.
 */
import { describe, expect, it } from 'vitest'

import { linkify, paragraphsOf } from '../../src/lib/discussionText.js'

const links = (line: string) =>
  linkify(line)
    .filter((s) => s.kind === 'link')
    .map((s) => (s.kind === 'link' ? s.text : ''))

describe('linkify', () => {
  it('links http and https URLs and keeps the rest as text', () => {
    expect(linkify('see https://example.org/a?b=1 and http://x.test')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'https://example.org/a?b=1', text: 'https://example.org/a?b=1' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', href: 'http://x.test/', text: 'http://x.test' },
    ])
  })

  it('leaves sentence punctuation outside the link', () => {
    expect(links('Read https://example.org.')).toEqual(['https://example.org'])
    expect(links('Is it https://example.org/page?')).toEqual(['https://example.org/page'])
    expect(links('(see https://example.org/x)')).toEqual(['https://example.org/x'])
    expect(links('https://en.wikipedia.org/wiki/Fraction_(mathematics), then')).toEqual([
      'https://en.wikipedia.org/wiki/Fraction_(mathematics)',
    ])
  })

  it('never links other schemes, and markup stays text', () => {
    for (const line of [
      'javascript:alert(1)',
      'ftp://example.org/file',
      '<a href="https://evil.test">x</a>',
      'mailto:someone@example.org',
    ]) {
      const segs = linkify(line)
      const linked = segs
        .filter((s) => s.kind === 'link')
        .map((s) => (s.kind === 'link' ? s.href : ''))
      expect(
        linked.every((href) => href.startsWith('http')),
        line,
      ).toBe(true)
      expect(segs.map((s) => s.text).join(''), line).toBe(line)
    }
    expect(links('<a href="https://evil.test">x</a>')).toEqual(['https://evil.test'])
  })

  it('reassembles to the original line', () => {
    const line = 'a https://x.test/(y) b, https://z.test! c'
    expect(
      linkify(line)
        .map((s) => s.text)
        .join(''),
    ).toBe(line)
  })
})

describe('paragraphsOf', () => {
  it('splits on newlines and drops blank lines', () => {
    expect(paragraphsOf('one\n\ntwo  \r\nthree')).toEqual(['one', 'two', 'three'])
    expect(paragraphsOf('   ')).toEqual([])
  })
})
