import { describe, expect, it } from 'vitest'
import type { FormState } from 'payload'
import { generatableFieldErrors } from '../../src/ingest/validateGeneratable'
import { PHASE_VALUES } from '../../src/fields/phases'
import {
  invalidFields,
  requestErrorMessage,
  rowsToReveal,
} from '../../src/components/LessonControls/validation'

describe('editor validation explanations', () => {
  it('reports the unnamed sixth phase by its actual field path and human position', () => {
    const issues = generatableFieldErrors({
      meta: {},
      lessons: [
        {
          slo: {},
          summaryTablePrompt: {},
          framework: [...PHASE_VALUES.map((phase) => ({ phase })), { phase: null }],
        },
      ],
    })
    expect(issues.find(({ path }) => path.endsWith('.phase'))).toEqual({
      path: 'lessons.0.framework.5.phase',
      label: 'Lesson 1, phase 6',
      message: 'Lesson 1, phase 6: Choose a phase from the list.',
    })
    expect(
      generatableFieldErrors({
        meta: {},
        lessons: [
          {
            slo: {},
            summaryTablePrompt: {},
            framework: [...PHASE_VALUES, PHASE_VALUES[0]].map((phase) => ({ phase })),
          },
        ],
      }).filter(({ path }) => path.includes('.framework')),
    ).toEqual([])
  })

  it('shows all nested server reasons instead of the generic validation heading', () => {
    expect(
      requestErrorMessage(
        {
          errors: [
            {
              message: 'The following fields are invalid:',
              data: {
                errors: [
                  { path: 'lessons.0.framework.5.phase', message: 'This field is required.' },
                  { path: 'lessons.1.framework.2.phase', message: 'This field is required.' },
                ],
              },
            },
          ],
        },
        'Save failed',
      ),
    ).toBe(
      'Lesson 1, phase 6: Choose a phase from the list.\nLesson 2, phase 3: Choose a phase from the list.',
    )
  })

  it('retains ordinary failure messages and handles malformed response bodies', () => {
    expect(requestErrorMessage({ errors: [{ message: 'Not allowed' }] }, 'Save failed')).toBe(
      'Not allowed',
    )
    for (const body of [null, {}, { errors: [null, {}, { message: 1 }] }]) {
      expect(requestErrorMessage(body, 'Save failed (500)')).toBe('Save failed (500)')
    }
  })

  it('ignores hidden invalid fields and opens only the relevant enclosing rows', () => {
    const fields = {
      lessons: {
        rows: [
          { id: 'a', collapsed: true },
          { id: 'b', collapsed: true },
        ],
      },
      'lessons.0.framework': {
        rows: [
          { id: 'c', collapsed: true },
          { id: 'd', collapsed: true },
        ],
      },
      'lessons.0.framework.1.phase': { valid: false, errorMessage: 'Required' },
      hidden: { valid: false, passesCondition: false },
    } as FormState
    expect(invalidFields(fields)).toEqual([
      {
        path: 'lessons.0.framework.1.phase',
        message: 'Lesson 1, phase 2: Choose a phase from the list.',
      },
    ])
    expect(
      rowsToReveal('lessons.0.framework.1.phase', fields).map(({ updatedRows }) =>
        updatedRows.map(({ collapsed }) => collapsed),
      ),
    ).toEqual([
      [false, true],
      [true, false],
    ])
  })
})
