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
 * The call order of the two lock-taking functions within one file, in source position order.
 *
 * Position order is the honest proxy for execution order here because every call sits directly in a
 * handler's straight-line `try` block — no branching, no callbacks. A file that grows a conditional
 * lock would need a different check, and would deserve one.
 */
function lockCallSequence(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const calls: { pos: number; name: string }[] = []
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      if (name === 'takeAdminCountLock' || name === 'lockAndVerifyFresh' || name === 'lockRows') {
        calls.push({ pos: node.getStart(sf), name })
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return calls.sort((a, b) => a.pos - b.pos).map((c) => c.name)
}

describe('users write paths take the global admin-count key before any row lock', () => {
  it.each(FILES)('%s', (file) => {
    const path = resolve(here, '../../src/endpoints', file)
    const sequence = lockCallSequence(readFileSync(path, 'utf8'), path)

    expect(sequence.length, `${file} should take both locks`).toBeGreaterThan(0)

    // Every row lock must be preceded by at least one global-key acquisition.
    let globalTaken = 0
    sequence.forEach((name, i) => {
      if (name === 'takeAdminCountLock') {
        globalTaken += 1
        return
      }
      expect(
        globalTaken,
        `${file}: \`${name}\` at call #${i + 1} takes a row lock with no preceding ` +
          '`takeAdminCountLock`. That inverts the pair against every generic PATCH/DELETE, which ' +
          'meets the global key in its hooks before the DML takes the row — an ABBA deadlock.',
      ).toBeGreaterThan(0)
    })
  })

  it('the guard itself still takes the key, so the generic path is covered too', () => {
    // The endpoints acquiring it early is an ORDERING fix, not a replacement: a plain PATCH never
    // touches those files, and its only protection is the hook.
    const hooks = readFileSync(resolve(here, '../../src/hooks/userRoles.ts'), 'utf8')
    expect(hooks).toContain('await takeAdminCountLock(req)')
  })
})
