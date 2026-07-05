/**
 * Version-immutability WIRING guard (audit 2026-07-04, Phase 2 invariant tripwires).
 *
 * Version immutability is a two-part mechanism (access/versionImmutability.ts): a form-render-only
 * `access.update` grant paired with a `beforeChange` hook that rejects every authenticated update.
 * The danger the audit named: a future edit could remove the hook from the collection (leaving the
 * permissive grant as an actual write hole) or repoint `access.update` at something that isn't the
 * render grant. tests/int already proves the BEHAVIOUR (updates 403), but that needs a DB and fails
 * later with a symptom. This asserts the WIRING itself — fast, DB-free, named — so a mis-wire is
 * caught the instant it lands. If this file goes red, read access/versionImmutability.ts before
 * "fixing" it.
 */
import { describe, it, expect } from 'vitest'

import { LessonBundleVersions } from '../../src/collections/LessonBundleVersions'
import {
  enforceVersionImmutable,
  versionUpdateGrantForFormRenderOnly,
} from '../../src/access/versionImmutability'

describe('lesson-bundle-versions immutability wiring', () => {
  it('access.update is exactly the form-render-only grant (never a bare write grant)', () => {
    expect(LessonBundleVersions.access?.update).toBe(versionUpdateGrantForFormRenderOnly)
  })

  it('enforceVersionImmutable is wired into beforeChange', () => {
    expect(LessonBundleVersions.hooks?.beforeChange).toContain(enforceVersionImmutable)
  })

  it('the hook rejects an AUTHENTICATED in-place update (any role) with 403', () => {
    const call = () =>
      (enforceVersionImmutable as (a: unknown) => unknown)({
        operation: 'update',
        req: { user: { id: 1 } },
      })
    expect(call).toThrow()
    try {
      call()
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403)
    }
  })

  it('lets trusted system paths (no req.user) and creates through untouched', () => {
    const run = (args: unknown) => (enforceVersionImmutable as (a: unknown) => unknown)(args)
    expect(() => run({ operation: 'update', req: { user: null } })).not.toThrow()
    expect(() => run({ operation: 'create', req: { user: { id: 1 } } })).not.toThrow()
  })
})
