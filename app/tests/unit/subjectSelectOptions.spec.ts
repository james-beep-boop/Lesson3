/**
 * Option-building for the `meta.subject` dropdown (SubjectSelectField, decided 2026-07-05): the
 * input is constrained to the live `subjects` taxonomy, but a stored value that is NOT in the
 * taxonomy (legacy data / a since-renamed subject) must stay displayable and re-selectable —
 * flagged, never blanked or silently rewritten. Also pins the wiring: the custom component is
 * actually attached to `meta.subject`.
 */
import { describe, it, expect } from 'vitest'

import { buildSubjectOptions } from '../../src/components/SubjectSelectField/options'
import { lessonContentFields } from '../../src/fields/lessonContent'

describe('buildSubjectOptions', () => {
  it('maps taxonomy names to options', () => {
    expect(buildSubjectOptions(['Biology', 'Chemistry'], 'Biology')).toEqual([
      { label: 'Biology', value: 'Biology' },
      { label: 'Chemistry', value: 'Chemistry' },
    ])
  })

  it('keeps a stored value missing from the taxonomy, flagged and first', () => {
    expect(buildSubjectOptions(['Biology'], 'Natural Science')).toEqual([
      { label: 'Natural Science (not in taxonomy)', value: 'Natural Science' },
      { label: 'Biology', value: 'Biology' },
    ])
  })

  it('adds no extra option for an empty value', () => {
    expect(buildSubjectOptions(['Biology'], null)).toEqual([{ label: 'Biology', value: 'Biology' }])
    expect(buildSubjectOptions(['Biology'], '')).toEqual([{ label: 'Biology', value: 'Biology' }])
  })
})

describe('meta.subject wiring', () => {
  it('the dropdown component is attached to meta.subject', () => {
    const metaGroup = lessonContentFields.find((f) => 'name' in f && f.name === 'meta') as {
      fields: Array<{ name?: string; admin?: { components?: { Field?: unknown } } }>
    }
    const subject = metaGroup.fields.find((f) => f.name === 'subject')
    expect(subject?.admin?.components?.Field).toBe('@/components/SubjectSelectField#default')
  })
})
