/**
 * The reset link must never reach the log stream (D5).
 *
 * ⚑ WHY A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST. The property is "this code path logs nothing",
 * and the honest way to check a negative is to look at the path: a runtime test can only prove that
 * the *cases it happened to drive* logged nothing, so it would stay green against a debug line on a
 * branch it did not take. The endpoint file is small and has exactly one job, which makes "contains
 * no logger call at all" both checkable and the right rule.
 *
 * ⚑ AND WHY IT EXISTS AT ALL: the file previously carried a comment asserting that an integration
 * test verified this. None did. A claim in a comment is not a guard, and this repo has been caught by
 * that shape before — the comment now points here.
 *
 * Same idea, and the same AST-over-regex discipline, as `tests/unit/jsonBodyCeiling.spec.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(here, '../../src/endpoints/userAdminActions.ts')

/** Logging sinks referenced by executable syntax, excluding comments and docblocks. */
function loggingSinks(source: string): string[] {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true)
  const sinks: string[] = []
  const walk = (node: ts.Node): void => {
    // Covers `logger(...)`, `logger.info(...)`, `payload.logger`, and destructured `{ logger }`.
    if (ts.isIdentifier(node) && node.text === 'logger') sinks.push('logger')

    // Element access has no Identifier named logger: `payload['logger']`.
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === 'logger'
    ) {
      sinks.push("['logger']")
    }

    // A console call is logging even though it never mentions a property named `logger`.
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const consoleCall =
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'console') ||
        (ts.isElementAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'console')
      if (consoleCall) sinks.push(callee.getText(sf))
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return sinks
}

/** Count all `${token}` spans, and the subset inside the returned reset-link property. */
function tokenInterpolationCounts(source: string): { all: number; resetLink: number } {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true)
  let all = 0
  let resetLink = 0

  const walk = (node: ts.Node): void => {
    if (ts.isTemplateSpan(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'token') all += 1
    }

    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'link' &&
      ts.isTemplateExpression(node.initializer)
    ) {
      const template = node.initializer
      const staticText =
        template.head.text + template.templateSpans.map((span) => span.literal.text).join('')
      if (staticText.includes('/reset-password?token=')) {
        resetLink += template.templateSpans.filter(
          (span) => ts.isIdentifier(span.expression) && span.expression.text === 'token',
        ).length
      }
    }

    ts.forEachChild(node, walk)
  }
  walk(sf)
  return { all, resetLink }
}

describe('the reveal-reset-link endpoint never logs', () => {
  it('makes no reference to a logger', () => {
    const source = readFileSync(FILE, 'utf8')
    expect(
      loggingSinks(source),
      'userAdminActions.ts must not call a logger or console — it handles a live credential. If a ' +
        'log line is genuinely needed, it must not carry the token, link, or response object, and ' +
        'this guard must be narrowed deliberately.',
    ).toEqual([])
  })

  it('interpolates the token into exactly one string — the link it returns', () => {
    // A companion to the rule above, aimed at the other way a token escapes: being folded into a
    // message. The only permitted use is the `/reset-password?token=` link itself.
    //
    // ⚑ AST, not a regex over the source. The first version counted `${token}` textually and failed
    // on the DOCBLOCK ABOVE, which quotes the very pattern it was policing — a false positive that
    // would have been "fixed" by loosening the guard. Template spans carry no comments, so counting
    // them asks the question that was actually meant. (Same AST-over-regex rule as
    // `jsonBodyCeiling.spec.ts`.)
    const counts = tokenInterpolationCounts(readFileSync(FILE, 'utf8'))
    expect(counts.all, 'the token may appear in exactly one interpolation: the reset link').toBe(1)
    expect(
      counts.resetLink,
      'the one token interpolation must belong to the returned /reset-password?token= link',
    ).toBe(1)
  })
})
