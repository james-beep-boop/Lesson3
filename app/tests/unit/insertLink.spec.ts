import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  activateLinkTarget,
  clearActiveLinkTarget,
  hasActiveLinkTarget,
  openActiveLinkTarget,
  subscribeToActiveLinkTarget,
} from '../../src/components/LinkedTextarea/activeTarget'
import {
  insertParenthesizedUrl,
  validExternalUrl,
} from '../../src/components/LinkedTextarea/insertLink'
import { lessonContentFields } from '../../src/fields/lessonContent'

afterEach(() => clearActiveLinkTarget())

describe('proof-of-concept link insertion', () => {
  it('inserts a parenthesized URL at the cursor and returns the new cursor', () => {
    expect(insertParenthesizedUrl('Read  first.', 5, 'https://example.org/file.pdf')).toEqual({
      value: 'Read (https://example.org/file.pdf) first.',
      cursor: 35,
    })
  })

  it('accepts complete HTTPS web addresses and rejects other schemes', () => {
    expect(validExternalUrl('https://www.youtube.com/watch?v=abc')).toBe(
      'https://www.youtube.com/watch?v=abc',
    )
    expect(validExternalUrl('http://example.org')).toBeNull()
    expect(validExternalUrl('javascript:alert(1)')).toBeNull()
    expect(validExternalUrl('not a URL')).toBeNull()
  })
})

describe('linkable prose field wiring', () => {
  const childFields = (field: unknown): unknown[] => (field as { fields?: unknown[] }).fields ?? []
  const named = (fields: unknown[], name: string) =>
    fields.find((field) => (field as { name?: string }).name === name) as {
      admin?: { components?: { Field?: unknown } }
      fields?: unknown[]
    }

  it('offers insertion on body prose but not interpolated lesson titles', () => {
    const lessons = named(lessonContentFields, 'lessons')
    const overview = named(childFields(lessons), 'overview')
    const title = named(childFields(lessons), 'title')
    expect(overview.admin?.components?.Field).toBe('@/components/LinkedTextarea#default')
    expect(title.admin?.components?.Field).toBeUndefined()
  })
})

describe('single toolbar link target', () => {
  it('stays unavailable until a field registers, then opens the latest registered field', () => {
    const first = vi.fn()
    const second = vi.fn()

    expect(hasActiveLinkTarget()).toBe(false)
    openActiveLinkTarget()
    expect(first).not.toHaveBeenCalled()

    activateLinkTarget({ id: Symbol('first'), openDialog: first })
    expect(hasActiveLinkTarget()).toBe(true)
    activateLinkTarget({ id: Symbol('second'), openDialog: second })
    openActiveLinkTarget()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('clears only the field that currently owns the cursor and notifies the toolbar', () => {
    const current = Symbol('current')
    const notifications = vi.fn()
    const unsubscribe = subscribeToActiveLinkTarget(notifications)

    activateLinkTarget({ id: current, openDialog: vi.fn() })
    clearActiveLinkTarget(Symbol('stale'))
    expect(hasActiveLinkTarget()).toBe(true)

    clearActiveLinkTarget(current)
    expect(hasActiveLinkTarget()).toBe(false)
    expect(notifications).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
