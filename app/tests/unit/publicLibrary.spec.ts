/**
 * Public-discovery deployment mode: the enable switch and the boot refusal
 * (`src/lib/publicLibrary.ts`; SPEC §2; `docs/DESIGN-public-library.md`).
 *
 * Two properties are worth a test rather than a reading, and both are about being WRONG safely:
 *
 *   1. Only the exact string `'1'` enables public discovery. Every other spelling — including the
 *      ones an operator reaches for to turn something OFF — must leave an offline school
 *      installation offline. A truthiness check would publish a corpus on `=false`.
 *   2. The flag without `SERVER_URL` refuses to boot, and the refusal NAMES both variables, because
 *      a fatal error whose remedy is not in its own text is a support ticket.
 *
 * DB-free and Payload-free → runs in `test:unit`.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { isPublicLibraryEnabled, publicLibraryBootRefusal } from '../../src/lib/publicLibrary.js'

const ORIGINAL = process.env.PUBLIC_LIBRARY_ENABLED

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLIC_LIBRARY_ENABLED
  else process.env.PUBLIC_LIBRARY_ENABLED = ORIGINAL
})

describe('isPublicLibraryEnabled', () => {
  it('enables public discovery on exactly "1"', () => {
    process.env.PUBLIC_LIBRARY_ENABLED = '1'
    expect(isPublicLibraryEnabled()).toBe(true)
  })

  it('is OFF when unset — the offline school deployment default', () => {
    delete process.env.PUBLIC_LIBRARY_ENABLED
    expect(isPublicLibraryEnabled()).toBe(false)
  })

  /**
   * ⚑ THE LOAD-BEARING CASE. `'false'`, `'0'`, `'no'` and `'off'` are all TRUTHY strings in JS, so a
   * `Boolean(process.env.X)` implementation passes every other test in this file and still serves a
   * public library to a school that wrote `PUBLIC_LIBRARY_ENABLED=false`. The blast radius is a
   * published corpus, not a misrendered page.
   */
  it.each(['0', 'false', 'FALSE', 'no', 'off', 'true', 'yes', '', ' ', '1 ', '01'])(
    'is OFF for %o — only the deliberate "1" counts',
    (value) => {
      process.env.PUBLIC_LIBRARY_ENABLED = value
      expect(isPublicLibraryEnabled()).toBe(false)
    },
  )
})

describe('publicLibraryBootRefusal', () => {
  it('permits the ordinary authenticated deployment: SERVER_URL set, feature off', () => {
    expect(
      publicLibraryBootRefusal({ enabled: false, serverUrl: 'https://lessons.example' }),
    ).toBeNull()
  })

  it('permits the offline deployment: neither set', () => {
    expect(publicLibraryBootRefusal({ enabled: false, serverUrl: undefined })).toBeNull()
  })

  it('permits a correctly configured public deployment', () => {
    expect(
      publicLibraryBootRefusal({ enabled: true, serverUrl: 'https://lessons.example' }),
    ).toBeNull()
  })

  it('REFUSES the public library without a base URL, naming both variables and the remedy', () => {
    const refusal = publicLibraryBootRefusal({ enabled: true, serverUrl: undefined })
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('PUBLIC_LIBRARY_ENABLED')
    expect(refusal).toContain('SERVER_URL')
  })

  /**
   * An EMPTY SERVER_URL is the shape the templates actually ship (`SERVER_URL=`), not `undefined` —
   * so treating only `undefined` as missing would let the default configuration through the guard.
   */
  it('treats an empty SERVER_URL as missing, which is what the templates ship', () => {
    expect(publicLibraryBootRefusal({ enabled: true, serverUrl: '' })).not.toBeNull()
  })
})
