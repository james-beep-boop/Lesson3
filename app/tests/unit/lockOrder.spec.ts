/**
 * The two-lock ordering rule for `users` writes, pinned structurally.
 *
 * THE RULE: `takeAdminCountLock` (the global `ADMIN_COUNT_LOCK`) is acquired BEFORE any per-user row
 * lock. It is not a free choice — a generic `PATCH`/`DELETE` runs its hooks, and therefore meets the
 * global key, before Payload issues the DML that takes the row lock. Every writer must match that or
 * two of them acquire the same pair in opposite orders, which is an ABBA deadlock Postgres resolves
 * by aborting a transaction.
 *
 * ⚑ WHY A SOURCE SCAN, AND NOT THE CONCURRENCY TEST. `userSecurity.int.spec.ts` asserts that a
 * demotion WAITS on the held key — a real and useful property — but it drives `payload.update`, i.e.
 * the generic path, which takes the key in its hook no matter what the endpoints do. Removing
 * `takeAdminCountLock` from every endpoint was watched leaving that test GREEN. The endpoints are not
 * reachable from the Local API at all, so the ordering they use can only be checked over the wire
 * (which needs the compose stack) or here, in the file that decides it.
 *
 * A docblock stating the rule is what this replaces: the rule had already been written down twice,
 * in two files, in opposite directions.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))

/** Endpoint files whose handlers take both locks. Add a file here when it joins the protocol. */
const FILES = ['userAdminActions.ts', 'userAssignments.ts'] as const

/**
 * The lock-call sequence PER ENCLOSING FUNCTION.
 *
 * ⚑ PER FUNCTION, NOT PER FILE, and the difference is a real hole the first version had. A
 * file-wide counter treats one handler's `takeAdminCountLock` as covering every other handler's row
 * lock — so deleting the acquisition from `booleanSetterEndpoint` alone left the guard green,
 * because `revealResetLinkEndpoint` earlier in the file had already incremented it. Each handler
 * opens its own transaction and must take the pair in order on its own.
 *
 * Position order within a body is the honest proxy for execution order here: every call sits in a
 * handler's straight-line `try` block, no branching and no callbacks. A file that grows a
 * conditional lock would need a different check, and would deserve one.
 */
function lockCallsByFunction(source: string, file: string): Map<string, string[]> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const byFunction = new Map<string, string[]>()

  const walk = (node: ts.Node, enclosing: string): void => {
    let scope = enclosing
    // Name the nearest enclosing function-ish node, so each handler is its own bucket.
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const named =
        (ts.isFunctionDeclaration(node) && node.name?.text) ||
        `anonymous@${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
      scope = String(named)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      if (name === 'takeAdminCountLock' || name === 'lockAndVerifyFresh' || name === 'lockRows') {
        byFunction.set(scope, [...(byFunction.get(scope) ?? []), name])
      }
    }
    ts.forEachChild(node, (child) => walk(child, scope))
  }
  walk(sf, '<module>')
  return byFunction
}

describe('users write paths take the global admin-count key before any row lock', () => {
  it.each(FILES)('%s', (file) => {
    const path = resolve(here, '../../src/endpoints', file)
    const byFunction = lockCallsByFunction(readFileSync(path, 'utf8'), path)

    expect(byFunction.size, `${file} should take locks in at least one handler`).toBeGreaterThan(0)

    for (const [fn, sequence] of byFunction) {
      let globalTaken = 0
      sequence.forEach((name, i) => {
        if (name === 'takeAdminCountLock') {
          globalTaken += 1
          return
        }
        expect(
          globalTaken,
          `${file} → ${fn}: \`${name}\` at call #${i + 1} takes a row lock with no preceding ` +
            '`takeAdminCountLock` IN THE SAME FUNCTION. That inverts the pair against every generic ' +
            'PATCH/DELETE, which meets the global key in its hooks before the DML takes the row — ' +
            'an ABBA deadlock.',
        ).toBeGreaterThan(0)
      })
    }
  })

  it('the guard itself still takes the key, so the generic path is covered too', () => {
    // The endpoints acquiring it early is an ORDERING fix, not a replacement: a plain PATCH never
    // touches those files, and its only protection is the hook.
    const hooks = readFileSync(resolve(here, '../../src/hooks/userRoles.ts'), 'utf8')
    expect(hooks).toMatch(/await\s+takeAdminCountLock\s*\(/)
  })
})
