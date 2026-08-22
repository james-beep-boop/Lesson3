/**
 * Lesson3-owned parenthesized-URL renderer.
 *
 * The pinned ARES generator remains byte-pristine. Immediately before generation, only linkable
 * prose strings containing `(http://…)` or `(https://…)` are replaced with the Paragraph[] shape
 * its existing `cell()` primitive already accepts. Strings with no recognized link are returned by
 * reference and continue through the exact pristine formatting path, preserving existing output.
 */
import { createRequire } from 'node:module'

import type { IRunOptions, Paragraph as DocxParagraph } from 'docx'

import type { AresDataObject } from './index'

// The pristine generator is CommonJS and its Packer must see objects created by the SAME docx
// module instance. Importing docx through this file's ESM path produces hyperlink objects that look
// correct but are not collected into the CommonJS Packer's relationship table.
const require = createRequire(import.meta.url)
const { AlignmentType, ExternalHyperlink, Paragraph, TextRun } =
  require('docx') as typeof import('docx')

const FONT = 'Arial'
const SIZE = 18
const LINK_COLOUR = '2E75B6'
const PARENTHESIZED_URL = /\((https?:\/\/[^\s<>()]+)\)/gi

type LinkToken = { kind: 'link'; url: string } | { kind: 'text'; text: string }

type Doc = Record<string, unknown>

const record = (value: unknown): Doc =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Doc) : {}

const safeHttpUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/** Pure tokenization is exported for the fast scheme/punctuation regression tests. */
export function tokenizeParenthesizedUrls(text: string): LinkToken[] {
  const tokens: LinkToken[] = []
  let cursor = 0
  PARENTHESIZED_URL.lastIndex = 0
  for (const match of text.matchAll(PARENTHESIZED_URL)) {
    const index = match.index ?? 0
    const url = safeHttpUrl(match[1])
    if (!url) continue
    if (index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, index) })
    tokens.push({ kind: 'text', text: '(' }, { kind: 'link', url }, { kind: 'text', text: ')' })
    cursor = index + match[0].length
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) })
  return tokens.length > 0 ? tokens : [{ kind: 'text', text }]
}

export const hasParenthesizedUrl = (text: string): boolean =>
  tokenizeParenthesizedUrls(text).some((token) => token.kind === 'link')

const textOptions = (text: string, bold: boolean): IRunOptions => ({
  text,
  font: FONT,
  size: SIZE,
  bold,
  color: '000000',
})

const childrenFor = (text: string, bold: boolean) =>
  tokenizeParenthesizedUrls(text).map((token) =>
    token.kind === 'text'
      ? new TextRun(textOptions(token.text, bold))
      : new ExternalHyperlink({
          link: token.url,
          children: [
            new TextRun({
              ...textOptions(token.url, bold),
              color: LINK_COLOUR,
              underline: { type: 'single', color: LINK_COLOUR },
            }),
          ],
        }),
  )

/** Match the pristine cell() paragraph/bullet geometry for the exceptional linked line. */
function linkedParagraph(line: string, bold: boolean): DocxParagraph {
  const isBullet = line.startsWith('• ') || line.startsWith('- ')
  const content = isBullet ? line.slice(2) : line
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: isBullet ? { after: 30, before: 0 } : { after: 40, before: 0 },
    ...(isBullet ? { indent: { left: 360, hanging: 180 } } : {}),
    children: [
      ...(isBullet ? [new TextRun(textOptions('\u2013  ', bold))] : []),
      ...childrenFor(content, bold),
    ],
  })
}

/** Preserve ordinary strings exactly; only a string with a recognized token changes shape. */
export function linkifyProse(value: unknown, options: { bold?: boolean } = {}): unknown {
  if (typeof value !== 'string' || !hasParenthesizedUrl(value)) return value
  return value.split('\n').map((line) => linkedParagraph(line, options.bold ?? false))
}

const linkifyKeys = (value: unknown, keys: readonly string[]): Doc => {
  const source = record(value)
  const output = { ...source }
  for (const key of keys) output[key] = linkifyProse(source[key])
  return output
}

const UNIT_PROSE = [
  'content',
  'learningOutcomes',
  'coreCompetencies',
  'values',
  'sep',
  'pcis',
  'careers',
  'focus',
  'drivingQuestion',
  'phenomenon',
  'supportingPhenomena',
  'storylineThread',
] as const

const SLO_PROSE = [
  'purpose',
  'knowledge',
  'skills',
  'attitudes',
  'keyInquiry',
  'purposeInStoryline',
  'safetyNotes',
] as const

const FRAMEWORK_PROSE = [
  'learnerExperience',
  'teacherMoves',
  'sensemakingStrategy',
  'formativeAssessment',
] as const

const SUMMARY_PROMPT_PROSE = ['observed', 'learned', 'explained'] as const

/**
 * Transform only fields that the editor marks linkable and the pristine generator hands to cell().
 * Titles are intentionally absent: ARES interpolates them into headings, so the POC does not offer
 * its Insert link control there either.
 */
export function withParenthesizedProseLinks(data: AresDataObject): AresDataObject {
  const lessons = Array.isArray(data.LESSONS)
    ? data.LESSONS.map((value) => {
        const lesson = record(value)
        return {
          ...lesson,
          slo: linkifyKeys(lesson.slo, SLO_PROSE),
          overview: linkifyProse(lesson.overview),
          framework: Array.isArray(lesson.framework)
            ? lesson.framework.map((phase) => linkifyKeys(phase, FRAMEWORK_PROSE))
            : lesson.framework,
          teacherReflection: linkifyProse(lesson.teacherReflection),
          summaryTablePrompt: linkifyKeys(lesson.summaryTablePrompt, SUMMARY_PROMPT_PROSE),
        }
      })
    : data.LESSONS

  const finalExplanation = data.FINAL_EXPLANATION
    ? (() => {
        const fe = record(data.FINAL_EXPLANATION)
        return {
          ...fe,
          instructions: linkifyProse(fe.instructions),
          sections: Array.isArray(fe.sections)
            ? fe.sections.map((value) => {
                const section = record(value)
                return {
                  ...section,
                  prompt: linkifyProse(section.prompt, { bold: true }),
                  exemplar: linkifyProse(section.exemplar),
                }
              })
            : fe.sections,
        }
      })()
    : undefined

  const summaryTable = data.SUMMARY_TABLE
    ? (() => {
        const table = record(data.SUMMARY_TABLE)
        return {
          ...table,
          lessons: Array.isArray(table.lessons)
            ? table.lessons.map((lesson) => linkifyKeys(lesson, SUMMARY_PROMPT_PROSE))
            : table.lessons,
        }
      })()
    : undefined

  return {
    ...data,
    UNIT: linkifyKeys(data.UNIT, UNIT_PROSE),
    LESSONS: lessons,
    FINAL_EXPLANATION: finalExplanation,
    SUMMARY_TABLE: summaryTable,
  }
}
