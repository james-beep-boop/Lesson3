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

const require = createRequire(import.meta.url)
const { Document, Packer } = require('docx') as {
  Document: new (options: unknown) => unknown
  Packer: { toBuffer: (document: unknown) => Promise<Buffer> }
}

describe('parenthesized prose hyperlinks', () => {
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
