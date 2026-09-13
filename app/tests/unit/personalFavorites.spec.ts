import { readFileSync } from 'node:fs'
import ts from 'typescript'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { findPersonalFavorites } from '../../src/lib/personalFavorites'
import type { User } from '../../src/payload-types'

describe('personal favorites query contract', () => {
  const user = { id: 7, roles: ['siteAdmin'] } as User

  it('explicitly scopes browse rows to their owner even when collection access permits all', async () => {
    const result = { docs: [{ id: 10, version: 20 }] }
    const find = vi.fn().mockResolvedValue(result)
    expect(await findPersonalFavorites({ find } as unknown as Payload, { user })).toBe(result)
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: 'favorites',
      where: { user: { equals: 7 } },
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { version: true },
    })
  })

  it('intersects the owner with the viewed version before limiting to one row', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] })
    await findPersonalFavorites({ find } as unknown as Payload, { user, versionId: 20 })
    expect(find).toHaveBeenCalledExactlyOnceWith({
      collection: 'favorites',
      where: { and: [{ user: { equals: 7 } }, { version: { equals: 20 } }] },
      overrideAccess: false,
      user,
      depth: 0,
      limit: 1,
      select: { version: true },
    })
  })

  it('propagates lookup failures rather than showing an unfavorited state', async () => {
    const error = new Error('database unavailable')
    const find = vi.fn().mockRejectedValue(error)
    await expect(findPersonalFavorites({ find } as unknown as Payload, { user })).rejects.toBe(
      error,
    )
  })
})

// Pin both consumers too: a correct helper left unused would leave the original defect intact.
describe('personal favorites frontend wiring', () => {
  it.each([
    ['browse', 'page.tsx', ['user']],
    ['detail', 'lessons/[id]/page.tsx', ['user', 'versionId: selectedId']],
  ])('%s uses the shared query with the session user', (_label, file, properties) => {
    const path = new URL(`../../src/app/(frontend)/${file}`, import.meta.url)
    const source = ts.createSourceFile(
      String(path),
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const calls: ts.CallExpression[] = []
    const imports: ts.ImportDeclaration[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) imports.push(node)
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'findPersonalFavorites'
      ) {
        calls.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(
      imports.some(
        (node) =>
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === '@/lib/personalFavorites' &&
          node.importClause?.namedBindings?.getText(source).includes('findPersonalFavorites'),
      ),
    ).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].arguments[0].getText(source)).toBe('payload')
    const options = calls[0].arguments[1]
    if (!ts.isObjectLiteralExpression(options)) throw new Error('expected explicit query options')
    expect(options.properties.map((node) => node.getText(source))).toEqual(properties)
  })
})
