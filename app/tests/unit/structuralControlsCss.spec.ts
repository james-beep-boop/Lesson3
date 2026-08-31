/**
 * The editor's structural-control hiding is a narrow affordance contract, not authorization.
 * Payload owns the DOM, so pin the exact installed class hooks we intentionally suppress and the
 * navigation hooks we must leave alone. The server-side field split remains the security boundary.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const scope = 'body:has(.lesson-controls-wrap--prose-only) .collection-edit--lesson-bundle-versions'
const adminCss = sass.compile(resolve(here, '../../src/app/(payload)/custom.scss')).css
const adminRoot = postcss.parse(adminCss)

type Rule = { selectors: string[]; body: string }
const rules: Rule[] = []
adminRoot.walkRules((rule) => {
  rules.push({
    selectors: rule.selectors.map((selector) => selector.replace(/\s+/g, ' ').trim()),
    body: rule.nodes.map((node) => node.toString()).join(';'),
  })
})

const scopedSelectors = rules.flatMap((rule) =>
  rule.selectors.filter((selector) => selector.startsWith(`${scope} `)),
)

const payloadCssPath = fileURLToPath(import.meta.resolve('@payloadcms/ui/styles.css'))
const payloadDist = dirname(payloadCssPath)
const payloadSelectors: string[] = []
postcss.parse(readFileSync(payloadCssPath, 'utf8')).walkRules((rule) => {
  payloadSelectors.push(...rule.selectors)
})
const arrayActionSource = readFileSync(
  resolve(payloadDist, 'elements/ArrayAction/index.js'),
  'utf8',
)
const arrayRowSource = readFileSync(resolve(payloadDist, 'fields/Array/ArrayRow.js'), 'utf8')

const payloadHasClass = (className: string) => {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exact = new RegExp(`\\.${escaped}(?![_a-zA-Z0-9-])`)
  return payloadSelectors.some((selector) => exact.test(selector))
}

describe('prose-only editor structural controls', () => {
  it('hides row actions, add-row buttons and drag handles behind the role marker', () => {
    const expected = [
      `${scope} .array-actions`,
      `${scope} .array-field__add-row`,
      `${scope} .array-field__row .collapsible__drag`,
    ]
    expect(scopedSelectors).toEqual(expect.arrayContaining(expected))
    for (const selector of expected) {
      const rule = rules.find((candidate) => candidate.selectors.includes(selector))
      expect(rule?.body, `${selector} must be hidden`).toMatch(/display:\s*none/)
    }
  })

  it('does not hide collapse/show navigation or row disclosure chevrons', () => {
    expect(scopedSelectors.join('\n')).not.toMatch(
      /\.array-field__header-action|\.collapsible__indicator|\.collapsible__toggle/,
    )
  })

  it('pins the installed Payload class hooks that the scoped rule depends on', () => {
    // ArrayAction's bare popup class has no standalone CSS declaration (only BEM children), so pin
    // the emitted baseClass literal in the installed component source. ArrayRow similarly composes
    // `array-field__row` at runtime rather than shipping a standalone stylesheet selector. The
    // other hooks all have exact selectors in Payload's compiled stylesheet.
    expect(arrayActionSource).toMatch(/const baseClass = ['"]array-actions['"];/)
    expect(arrayRowSource).toMatch(/const baseClass = ['"]array-field['"];/)
    expect(arrayRowSource).toContain('`${baseClass}__row`')
    for (const className of [
      'array-field__add-row',
      'collapsible__drag',
      'array-field__header-action',
      'collapsible__indicator',
    ]) {
      expect(payloadHasClass(className), `Payload must still ship .${className}`).toBe(true)
    }
  })
})
