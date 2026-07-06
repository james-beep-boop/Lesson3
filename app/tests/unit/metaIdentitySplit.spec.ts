/**
 * META identity split (decided 2026-07-05): `meta.subject` / `meta.grade` / `meta.substrand_id` are
 * Site-Admin-only corruption-repair fields — subject/grade only label the printed document (the
 * plan's `subjectGrade` relationship is the categorization truth) and substrand_id is the re-ingest
 * matching key, so there is no curation reason for a Subject Admin to change them.
 *
 * Enforcement is two-layer, mirroring the rest of SPEC §5: field access (`siteAdminOnly`) covers the
 * form render + direct create/update, but the REAL write path (save-as-new) writes via
 * `overrideAccess`, so the rule that actually holds is inside `applyEditorFieldSplit`. This spec
 * pins that split logic DB-free; the wire-level proof lives in tests/http/endpoints.http.spec.ts.
 */
import { describe, it, expect } from 'vitest'

import { applyEditorFieldSplit, META_IDENTITY_KEYS } from '../../src/hooks/fieldSplit'
import { VERSION_EDITOR_KEYS } from '../../src/hooks/bundleVersion'
import { siteAdminField } from '../../src/access'
import { lessonContentFields } from '../../src/fields/lessonContent'

const SG_ID = 42

const subjectAdmin = {
  id: 1,
  assignments: [{ subjectGrade: SG_ID, role: 'subjectAdmin' }],
} as never
const siteAdmin = { id: 2, roles: ['siteAdmin'] } as never

const originalDoc = () => ({
  subjectGrade: SG_ID,
  meta: {
    subject: 'Biology',
    grade: 10,
    substrand_id: '1.3',
    titleDoc: 'ORIGINAL TITLE',
  },
})

const tamperedData = () => ({
  subjectGrade: SG_ID,
  meta: {
    subject: 'Chemistry', // identity tamper
    grade: 12, // identity tamper
    substrand_id: '9.9', // identity tamper (re-ingest key)
    titleDoc: 'EDITED TITLE', // legitimate Subject-Admin META edit
  },
})

const run = (user: unknown, data: Record<string, unknown>) =>
  applyEditorFieldSplit({
    data,
    originalDoc: originalDoc(),
    operation: 'update',
    req: { user } as never,
    editorTopLevelKeys: VERSION_EDITOR_KEYS,
  }) as { meta: Record<string, unknown> }

describe('META identity is Site-Admin-only through the field-split', () => {
  it('Subject Admin: identity restored from the stored doc, other META edits kept', () => {
    const out = run(subjectAdmin, tamperedData())
    expect(out.meta.subject).toBe('Biology')
    expect(out.meta.grade).toBe(10)
    expect(out.meta.substrand_id).toBe('1.3')
    expect(out.meta.titleDoc).toBe('EDITED TITLE')
  })

  it('Subject Admin omitting meta entirely still gets identity re-attached', () => {
    const out = run(subjectAdmin, { subjectGrade: SG_ID })
    expect(out.meta.subject).toBe('Biology')
    expect(out.meta.grade).toBe(10)
    expect(out.meta.substrand_id).toBe('1.3')
  })

  it('Site Admin: identity edits pass through (the corruption-repair path)', () => {
    const out = run(siteAdmin, tamperedData())
    expect(out.meta.subject).toBe('Chemistry')
    expect(out.meta.grade).toBe(12)
    expect(out.meta.substrand_id).toBe('9.9')
  })

  it('trusted system path (no user) passes through untouched', () => {
    const out = run(null, tamperedData())
    expect(out.meta.subject).toBe('Chemistry')
  })
})

describe('META identity field-access wiring (form render + direct create/update)', () => {
  // The identity fields carry siteAdminField on create AND update — this is what renders them
  // read-only for Subject Admins in the editor form. Identity-equality, same idiom as the
  // versionImmutabilityWiring spec.
  const metaGroup = lessonContentFields.find((f) => 'name' in f && f.name === 'meta') as {
    fields: Array<{ name?: string; access?: { create?: unknown; update?: unknown } }>
  }

  it.each([...META_IDENTITY_KEYS])('meta.%s is siteAdminField', (name) => {
    const field = metaGroup.fields.find((f) => f.name === name)
    expect(field?.access?.create).toBe(siteAdminField)
    expect(field?.access?.update).toBe(siteAdminField)
  })

  it('the two enforcement layers name the SAME fields (drift guard)', () => {
    // The rule is two-layer and fails UNSAFE on drift: a meta subfield marked siteAdminField in the
    // schema but missing from META_IDENTITY_KEYS would LOOK locked (read-only form, direct writes
    // stripped) while the real write path — save-as-new via the fieldSplit hook, the write-time
    // authority — let Subject Admins change it freely. Same test-enforced-sync pattern as
    // proseWhitelistDrift.spec.ts.
    const marked = metaGroup.fields
      .filter((f) => f.access?.update === siteAdminField)
      .map((f) => f.name)
      .sort()
    expect(marked).toEqual([...META_IDENTITY_KEYS].sort())
  })
})
