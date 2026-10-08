import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { restoreErrorClassNames } from '../../src/lib/restoreErrorClassNames'

/** A class with NO name, exactly as the Next.js 16.4.0 production bundle emits Payload's errors. */
const anonymousError = () =>
  class extends Error {
    constructor(message: string) {
      super(message)
      this.name = this.constructor.name // what Payload's ExtendableError does
    }
  }

describe('restoreErrorClassNames', () => {
  it('the premise: an anonymous class really has no name, and its instances inherit that', () => {
    const Anon = anonymousError()
    expect(Anon.name).toBe('')
    expect(new Anon('x').name).toBe('')
  })

  it('names an anonymous Error subclass after its export key, so instances carry that name', () => {
    const Forbidden = anonymousError()
    const exports = { Forbidden }
    expect(restoreErrorClassNames(exports)).toEqual(['Forbidden'])
    expect(Forbidden.name).toBe('Forbidden')
    expect(new Forbidden('no').name).toBe('Forbidden')
  })

  it('leaves an already-named class alone — a Next.js that fixes the naming makes this a no-op', () => {
    class APIError extends Error {}
    expect(restoreErrorClassNames({ SomethingElse: APIError })).toEqual([])
    expect(APIError.name).toBe('APIError')
  })

  it('touches only Error subclasses: other functions, classes and values are not renamed', () => {
    const plainFn = (
      () => () =>
        1
    )()
    const plainClass = (() => class {})()
    const exports = { plainFn, plainClass, count: 3, text: 'x', nothing: null }
    expect(restoreErrorClassNames(exports)).toEqual([])
    expect(plainFn.name).toBe('')
    expect(plainClass.name).toBe('')
  })

  it('survives a throwing export getter (an ESM namespace can expose one)', () => {
    const NotFound = anonymousError()
    const exports = Object.defineProperties(
      {},
      {
        boom: {
          enumerable: true,
          get() {
            throw new Error('getter exploded')
          },
        },
        NotFound: { enumerable: true, value: NotFound },
      },
    )
    expect(restoreErrorClassNames(exports)).toEqual(['NotFound'])
  })

  it('is idempotent', () => {
    const exports = { Locked: anonymousError() }
    expect(restoreErrorClassNames(exports)).toEqual(['Locked'])
    expect(restoreErrorClassNames(exports)).toEqual([])
  })

  it('is wired into payload.config.ts BEFORE buildConfig runs', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/payload.config.ts'), 'utf8')
    const call = source.indexOf('restoreErrorClassNames(payloadExports')
    expect(call).toBeGreaterThan(-1)
    expect(call).toBeLessThan(source.indexOf('export default buildConfig'))
    expect(source).toContain("import * as payloadExports from 'payload'")
  })
})
