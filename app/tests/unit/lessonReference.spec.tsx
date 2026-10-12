// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Payload } from 'payload'
import type { User } from '../../src/payload-types'
import LessonReference from '../../src/components/LessonReference'
import { resolveVersionReferences } from '../../src/lib/resolveLessonReferences'

afterEach(cleanup)
const user = { id: 7 } as User

describe('shared lesson references', () => {
  it('uses batched caller-scoped reads, deduplicates versions, and only compares readable sources', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [
          { id: 12, lessonPlan: 3, sourceVersion: 11 },
          { id: 14, lessonPlan: 3, sourceVersion: 13 },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ id: 11 }] })
    const refs = await resolveVersionReferences({ find } as unknown as Payload, user, [
      { refVersion: 12, refLabel: 'Fractions · v1.0.1' },
      { refVersion: 12, refLabel: 'Fractions · v1.0.1' },
      { refVersion: 14, refLabel: 'Fractions · v1.0.2' },
      { refVersion: null, refLabel: 'Fractions · v0.9.0' },
      { refVersion: null, refLabel: null },
    ])
    expect(find).toHaveBeenCalledTimes(2)
    expect(find.mock.calls[0][0]).toMatchObject({
      overrideAccess: false,
      user,
      where: { id: { in: [12, 14] } },
      depth: 0,
    })
    expect(find.mock.calls[1][0]).toMatchObject({
      overrideAccess: false,
      user,
      where: { id: { in: [11, 13] } },
    })
    expect(refs[0]).toEqual({
      label: 'Fractions · v1.0.1',
      lessonHref: '/lessons/3?version=12',
      compareHref: '/lessons/3/compare?from=11&to=12',
    })
    expect(refs[2]?.compareHref).toBeNull()
    expect(refs[3]).toEqual({ label: 'Fractions · v0.9.0', lessonHref: null, compareHref: null })
    expect(refs[4]).toBeNull()
  })

  it('does not hide a database failure as an unavailable reference', async () => {
    const failure = new Error('database unavailable')
    const find = vi.fn().mockRejectedValue(failure)
    await expect(
      resolveVersionReferences({ find } as unknown as Payload, user, [{ refVersion: 12 }]),
    ).rejects.toBe(failure)
  })

  it('shows an unavailable snapshot without a lesson or comparison link', () => {
    render(
      <LessonReference
        reference={{ label: 'Fractions · v1.0.1', lessonHref: null, compareHref: null }}
      />,
    )
    expect(screen.getByText('Fractions · v1.0.1')).toBeTruthy()
    expect(screen.getByText('(this version is no longer available)')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a whole-lesson link without an unavailable-version warning', () => {
    render(
      <LessonReference
        reference={{ label: 'Fractions', lessonHref: '/lessons/3', compareHref: null }}
        className="msg-link"
      />,
    )
    expect(screen.getByRole('link', { name: 'Fractions' }).getAttribute('href')).toBe('/lessons/3')
    expect(screen.queryByText('(this version is no longer available)')).toBeNull()
  })
})
