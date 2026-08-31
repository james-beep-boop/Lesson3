/**
 * Static component class names must resolve to an app stylesheet rule.
 *
 * This deliberately is not a CSS-framework validator. It covers app-owned TSX in `src/components`,
 * extracts literal class tokens with the TypeScript AST (including strings inside ternaries and
 * template expressions), and checks the two rendered-surface stylesheets. Dynamic values passed in
 * through props are outside the contract; their literal call sites are checked where they exist.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import * as sass from 'sass'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentRoot = resolve(here, '../../src/components')
const frontendCss = readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8')
const adminCss = sass.compile(resolve(here, '../../src/app/(payload)/custom.scss')).css

const CLASS_TOKEN = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/
const CSS_NAME_CHAR = '[_a-zA-Z0-9-]'

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return extname(entry.name) === '.tsx' ? [path] : []
  })
}

function literalStrings(node: ts.Node): string[] {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return [node.text]
  }

  const values: string[] = []
  node.forEachChild((child) => {
    values.push(...literalStrings(child))
  })
  return values
}

function classExpressionStrings(expression: ts.Expression): string[] {
  if (!ts.isTemplateExpression(expression)) return literalStrings(expression)

  const values = [expression.head.text]
  let preceding = expression.head.text
  for (const span of expression.templateSpans) {
    const branches = literalStrings(span.expression)
    // In `card ${active ? ' card--active' : ''}` the branch contributes a complete class. In
    // `status--${tone ? 'good' : 'bad'}` it only completes the preceding token, so `good` and
    // `bad` must not be mistaken for standalone class names.
    values.push(...branches.filter((value) => /\s$/.test(preceding) || /^\s/.test(value)))
    values.push(span.literal.text)
    preceding = span.literal.text
  }
  return values
}

export function staticClassNames(sourceText: string, filename = 'component.tsx'): Set<string> {
  const source = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const names = new Set<string>()

  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer) {
      const values = ts.isStringLiteral(node.initializer)
        ? [node.initializer.text]
        : ts.isJsxExpression(node.initializer) && node.initializer.expression
          ? classExpressionStrings(node.initializer.expression)
          : []

      for (const value of values) {
        for (const token of value.split(/\s+/)) {
          // A template head such as `status--${tone}` is not itself a class; only its completed
          // literal variants can be checked statically.
          if (CLASS_TOKEN.test(token) && !token.endsWith('-')) names.add(token)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return names
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stylesheetSelectors(...sources: string[]): string[] {
  return sources.flatMap((source) => {
    const selectors: string[] = []
    postcss.parse(source).walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    return selectors
  })
}

const selectors = stylesheetSelectors(frontendCss, adminCss)

export function stylesheetHasRule(ruleSelectors: readonly string[], className: string): boolean {
  const exact = new RegExp(`\\.${escaped(className)}(?!${CSS_NAME_CHAR})`)
  return ruleSelectors.some((selector) => exact.test(selector))
}

describe('component className stylesheet contract', () => {
  it('extracts literals through expression and template branches', () => {
    const found = staticClassNames(`
      const x = <div className={'card ' + (active ? 'card--active' : 'card--quiet')} />
    `)
    expect([...found].sort()).toEqual(['card', 'card--active', 'card--quiet'])
  })

  it('requires a selector, not a class name mentioned only in a stylesheet comment', () => {
    const source = '/* .comment-only */\n.real-rule { color: blue; }'
    const parsed = stylesheetSelectors(source)
    expect(stylesheetHasRule(parsed, 'comment-only')).toBe(false)
    expect(stylesheetHasRule(parsed, 'real-rule')).toBe(true)
  })

  it('keeps a nested BEM suffix scoped to the block that owns it', () => {
    const compiled = sass.compileString(`
      .lp-manage { color: blue; }
      .lp-delete-plans { &__num { color: red; } }
    `).css
    const parsed = stylesheetSelectors(compiled)
    expect(stylesheetHasRule(parsed, 'lp-delete-plans__num')).toBe(true)
    expect(stylesheetHasRule(parsed, 'lp-manage__num')).toBe(false)
  })

  it('gives every app-owned static component class a stylesheet rule', () => {
    const missing = tsxFiles(componentRoot).flatMap((path) =>
      [...staticClassNames(readFileSync(path, 'utf8'), path)]
        .filter((name) => !stylesheetHasRule(selectors, name))
        .map((name) => `${path.slice(componentRoot.length + 1)}: .${name}`),
    )

    expect(missing, 'add a stylesheet rule or remove the dead className token').toEqual([])
  })
})
