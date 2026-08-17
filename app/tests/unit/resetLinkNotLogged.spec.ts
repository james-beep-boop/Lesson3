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

/** Every property name accessed anywhere in the file, e.g. the `logger` in `payload.logger.info`. */
function accessedProperties(source: string): Set<string> {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true)
  const names = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) names.add(node.name.text)
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return names
}

describe('the reveal-reset-link endpoint never logs', () => {
  it('makes no reference to a logger', () => {
    const source = readFileSync(FILE, 'utf8')
    expect(
      accessedProperties(source).has('logger'),
      'userAdminActions.ts must not touch payload.logger — it handles a live credential, and the ' +
        'logger is a JSON stream. If a log line is genuinely needed here, it must not carry the ' +
        'token, the link, or the whole response object, and this guard must be narrowed deliberately.',
    ).toBe(false)
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
    const sf = ts.createSourceFile(FILE, readFileSync(FILE, 'utf8'), ts.ScriptTarget.Latest, true)
    let interpolations = 0
    const walk = (node: ts.Node): void => {
      if (ts.isTemplateSpan(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'token') interpolations += 1
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)
    expect(
      interpolations,
      'the token may appear in exactly one interpolation: the reset link',
    ).toBe(1)
  })
})
