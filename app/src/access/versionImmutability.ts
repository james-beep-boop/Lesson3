/**
 * VERSION IMMUTABILITY — one mechanism, two halves. THESE TWO EXPORTS ARE A PAIR: do not change,
 * move, or "simplify" one without the other (and without reading this block). Colocated + named
 * this way after the 2026-07-04 audit flagged the pair as the codebase's most misreadable
 * mechanism: an update-access grant that must never be read as permission to write.
 *
 * The product rule (SPEC §6): a saved lesson-plan version is an IMMUTABLE snapshot. Authoring goes
 * through `POST /:id/save-as-new` (a CREATE applying the Editor field-split); nothing is ever
 * written back to an existing row, so retained versions stay byte-stable and the Official pointer
 * always names exactly the content it named yesterday.
 *
 * The Payload wrinkle that forces the pair: Payload renders the ENTIRE admin edit form read-only
 * when the user lacks `update` permission (`readOnly = !hasSavePermission`, verified in installed
 * source). The editing UX needs the form typeable (LessonControls' Edit/Save drive save-as-new),
 * so:
 *
 *  - {@link versionUpdateGrantForFormRenderOnly} (`access.update`) answers "yes" for Editors and
 *    Subject Admins in their subject-grades — ONLY so Payload renders the form editable. IT IS NOT
 *    A WRITE GRANT: nothing may cite it as authorization to persist an update, and reusing it in
 *    another access decision is a bug.
 *  - {@link enforceVersionImmutable} (`beforeChange`) is the actual guarantee: it REJECTS every
 *    AUTHENTICATED in-place `update` — whatever the access grant said, whichever role, including a
 *    stray/direct API PATCH. Trusted system paths (no `req.user`: migrations, data fixes via
 *    overrideAccess) may still write — the same carve-out as the field-split.
 *
 * The wiring is pinned by tests/unit/versionImmutabilityWiring.spec.ts (the hook must sit in the
 * collection's `hooks.beforeChange` and `access.update` must be exactly the render grant) and
 * behaviorally by tests/int/access.int.spec.ts + tests/http (authenticated updates are rejected
 * for every role, over the Local API and the wire).
 */
import type { Access, CollectionBeforeChangeHook } from 'payload'
import { APIError, type Where } from 'payload'

import type { User } from '@/payload-types'
import { isSiteAdmin, subjectGradeIdsByRole } from './index'

/**
 * `access.update` for lesson-bundle-versions — a FORM-RENDER grant, not a write grant (see the
 * module block). Scope mirrors delete: Editors + Subject Admins in their subject-grades, Site
 * Admin everywhere. Every write this appears to allow is rejected by {@link enforceVersionImmutable}.
 */
export const versionUpdateGrantForFormRenderOnly: Access = ({ req: { user } }) => {
  const u = user as User | null | undefined
  if (isSiteAdmin(u)) return true
  const ids = subjectGradeIdsByRole(u, ['editor', 'subjectAdmin'])
  return ids.length ? ({ subjectGrade: { in: ids } } satisfies Where) : false
}

/**
 * The immutability guarantee (see the module block): reject every AUTHENTICATED in-place update.
 * Runs first in `beforeChange`, before any data-shaping hook could matter.
 */
export const enforceVersionImmutable: CollectionBeforeChangeHook = ({ operation, req }) => {
  if (operation === 'update' && req.user) {
    throw new APIError('Versions are immutable — save your changes as a new version instead.', 403)
  }
}
