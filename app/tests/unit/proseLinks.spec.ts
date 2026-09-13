import { createRequire } from 'node:module'

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { bundleToAresData } from '../../src/generator/adapter'
import { generateLessonSequenceDocx } from '../../src/generator/index'
import {
  linkifyProse,
  tokenizeParenthesizedUrls,
  withParenthesizedProseLinks,
} from '../../src/generator/proseLinks'
import { minimalBundleContent } from '../helpers/fixtures'
import {
  insertParenthesizedUrl,
  validExternalUrl,
} from '../../src/components/LinkedTextarea/insertLink'
import { SLO_PROSE, FRAMEWORK_PROSE, SUMMARY_PROMPT_PROSE } from '../../src/hooks/fieldSplit'

const require = createRequire(import.meta.url)
const { Document, Packer } = require('docx') as {
  Document: new (options: unknown) => unknown
  Packer: { toBuffer: (document: unknown) => Promise<Buffer> }
}

describe('parenthesized prose hyperlinks', () => {
  it.each([
    'https://en.wikipedia.org/wiki/Force_(physics)',
    'https://example.org/?q=(force_(physics))',
    'https://example.org/Force_%28physics%29',
  ])('preserves a complete existing URL: %s', async (url) => {
    expect(validExternalUrl(url)).toBe(url)
    expect(tokenizeParenthesizedUrls(`See (${url}).`).filter((t) => t.kind === 'link')).toEqual([
      { kind: 'link', url },
    ])
    const document = new Document({ sections: [{ children: linkifyProse(`(${url})`) }] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(document))
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain(
      `Target="${url}"`,
    )
  })

  it('encodes new URL delimiters, even when they are unbalanced', () => {
    for (const url of ['https://example.org/a(b', 'https://example.org/a)b']) {
      const inserted = insertParenthesizedUrl('', 0, validExternalUrl(url)!).value
      expect(tokenizeParenthesizedUrls(inserted).filter((t) => t.kind === 'link')).toEqual([
        { kind: 'link', url: url.replace(/\(/g, '%28').replace(/\)/g, '%29') },
      ])
    }
  })

  it('keeps malformed candidates as text without hiding a following valid link', () => {
    const text = '(https://example.org/unclosed (https://example.org/ok)'
    expect(tokenizeParenthesizedUrls(text).filter((t) => t.kind === 'link')).toEqual([
      { kind: 'link', url: 'https://example.org/ok' },
    ])
    expect(linkifyProse('(https://example.org/unclosed')).toBe('(https://example.org/unclosed')
  })

  it('keeps generator prose mappings in step with the editable field contract', () => {
    const prose = (keys: readonly string[]) =>
      Object.fromEntries(keys.map((key) => [key, '(https://example.org)']))
    const data = withParenthesizedProseLinks({
      META: {},
      UNIT: {},
      LESSONS: [
        {
          slo: prose(SLO_PROSE),
          framework: [prose(FRAMEWORK_PROSE)],
          summaryTablePrompt: prose(SUMMARY_PROMPT_PROSE),
        },
      ],
      SUMMARY_TABLE: { lessons: [prose(SUMMARY_PROMPT_PROSE)] },
    })
    const lesson = data.LESSONS[0] as Record<string, unknown>
    for (const [keys, value] of [
      [SLO_PROSE, lesson.slo],
      [FRAMEWORK_PROSE, (lesson.framework as unknown[])[0]],
      [SUMMARY_PROMPT_PROSE, lesson.summaryTablePrompt],
      [SUMMARY_PROMPT_PROSE, (data.SUMMARY_TABLE as { lessons: unknown[] }).lessons[0]],
    ] as const) {
      for (const key of keys)
        expect(Array.isArray((value as Record<string, unknown>)[key]), key).toBe(true)
    }
  })

  it('recognizes only parenthesized HTTP(S) addresses and preserves the parentheses', () => {
    expect(tokenizeParenthesizedUrls('Watch (https://youtu.be/example) now.')).toEqual([
      { kind: 'text', text: 'Watch ' },
      { kind: 'text', text: '(' },
      { kind: 'link', url: 'https://youtu.be/example' },
      { kind: 'text', text: ')' },
      { kind: 'text', text: ' now.' },
    ])
    expect(tokenizeParenthesizedUrls('https://example.org')).toEqual([
      { kind: 'text', text: 'https://example.org' },
    ])
    expect(tokenizeParenthesizedUrls('(javascript:alert(1))')).toEqual([
      { kind: 'text', text: '(javascript:alert(1))' },
    ])
  })

  it('leaves unlinked prose as the original string and transforms mapped linked prose only', () => {
    expect(linkifyProse('ordinary prose')).toBe('ordinary prose')
    const data = withParenthesizedProseLinks({
      META: {},
      UNIT: {},
      LESSONS: [
        {
          title: 'Title (https://example.org/title)',
          overview: 'Read (https://example.org/file.pdf)',
          slo: {},
          framework: [],
          summaryTablePrompt: {},
        },
      ],
    })
    const lesson = data.LESSONS[0] as Record<string, unknown>
    expect(lesson.title).toBe('Title (https://example.org/title)')
    expect(Array.isArray(lesson.overview)).toBe(true)
  })

  it('writes a real DOCX hyperlink relationship rather than relying on Word auto-detection', async () => {
    const paragraphs = linkifyProse('Open (https://example.org/resource.pdf)')
    expect(Array.isArray(paragraphs)).toBe(true)
    const document = new Document({ sections: [{ children: paragraphs }] })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(document))
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(relationships).toContain('Target="https://example.org/resource.pdf"')
    expect(xml).toContain('w:hyperlink')
    expect(xml).toContain('(')
    expect(xml).toContain(')')
  })

  it('carries a lesson prose URL through the complete lesson-sequence generator', async () => {
    const bundle = minimalBundleContent()
    bundle.lessons[0].overview = 'Open (https://example.org/complete-path.pdf)'

    const docx = await generateLessonSequenceDocx(bundleToAresData(bundle as never))
    const zip = await JSZip.loadAsync(docx)
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const xml = await zip.file('word/document.xml')!.async('string')

    expect(relationships).toContain('Target="https://example.org/complete-path.pdf"')
    expect(xml).toContain('w:hyperlink')
  })
})
