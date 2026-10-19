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
  labelError,
} from '../../src/components/LinkedTextarea/insertLink'
import { lessonContentFields } from '../../src/fields/lessonContent'

afterEach(() => clearActiveLinkTarget())

describe('plain-text link insertion', () => {
  it('inserts a parenthesized URL at the cursor and returns the new cursor', () => {
    expect(insertParenthesizedUrl('Read  first.', 5, 'https://example.org/file.pdf')).toEqual({
      value: 'Read (https://example.org/file.pdf) first.',
      cursor: 35,
    })
  })

  it('normalizes complete HTTP/HTTPS addresses and rejects other schemes', () => {
    expect(validExternalUrl('https://www.youtube.com/watch?v=abc')).toBe(
      'https://www.youtube.com/watch?v=abc',
    )
    expect(validExternalUrl('http://example.org')).toBe('http://example.org/')
    expect(validExternalUrl('https:example.org')).toBeNull()
    expect(validExternalUrl('http://example.org/a b')).toBe('http://example.org/a%20b')
    expect(validExternalUrl('  HTTPS://EXAMPLE.ORG:443/a  ')).toBe('https://example.org/a')
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

  it('offers insertion only on the four framework columns, never other prose', () => {
    const lessons = named(lessonContentFields, 'lessons')
    const framework = named(childFields(lessons), 'framework')
    for (const name of [
      'learnerExperience',
      'teacherMoves',
      'sensemakingStrategy',
      'formativeAssessment',
    ]) {
      expect(named(childFields(framework), name).admin?.components?.Field).toMatchObject({
        path: '@/components/LinkedTextarea#default',
      })
    }
    for (const name of ['overview', 'title', 'teacherReflection'])
      expect(named(childFields(lessons), name).admin?.components?.Field).toBeUndefined()
    expect(
      named(childFields(named(lessonContentFields, 'unit')), 'content').admin?.components?.Field,
    ).toBeUndefined()
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

describe('optional plain-text labels', () => {
  it('trims the label and preserves surrounding text, parentheses and the cursor', () => {
    const result = insertParenthesizedUrl(
      'Before  after',
      7,
      'http://ares.local/a(b)',
      '  Video (plants)  ',
    )
    expect(result.value).toBe('Before Video (plants) (http://ares.local/a%28b%29) after')
    expect(result.cursor).toBe(result.value.indexOf(' after'))
  })
  it('bounds labels and refuses newlines without treating parentheses as markup', () => {
    expect(labelError('x'.repeat(120))).toBeNull()
    expect(labelError('x'.repeat(121))).toBe('Keep the label to 120 characters or fewer.')
    expect(labelError('a\nb')).toBe('Keep the label on one line.')
    expect(labelError(' (plants) ')).toBeNull()
  })
})

describe('label insertion boundaries', () => {
  it.each([
    ['Watch this', 10, 'Watch this Video (https://example.org)'],
    ['Beforeafter', 6, 'Before Video (https://example.org) after'],
    ['Read .', 5, 'Read Video (https://example.org).'],
    ['(read)', 1, '(Video (https://example.org) read)'],
    ['', 0, 'Video (https://example.org)'],
  ])('separates words without adding space before punctuation: %s', (value, cursor, expected) => {
    const result = insertParenthesizedUrl(value, cursor, 'https://example.org', 'Video')
    expect(result.value).toBe(expected)
    expect(result.value.slice(result.cursor)).toBe(value.slice(cursor))
  })
})

describe('labels cannot introduce document markup', () => {
  it.each([
    'See (https://evil.example) notes',
    '(HTTP://example.org/a(b))',
    '(http://example.org)',
  ])('rejects a real link: %s', (label) => {
    expect(labelError(label)).toBe('Keep web addresses out of the label. Use the Web address box.')
  })
  it.each(['- Video', '  - Video', '| Video'])(
    'rejects a leading bullet or table marker: %s',
    (label) => {
      expect(labelError(label)).toBe(
        'A label can\'t start with "- " or "|". Those turn the line into a bullet or a table.',
      )
    },
  )
  it.each([
    'PhET simulation at phet.colorado.edu',
    'Visit https://example.org',
    'Plants (transport)',
    '(https://)',
    '(https://example.org',
    'A - B | C',
  ])('allows plain label text: %s', (label) => {
    expect(labelError(label)).toBeNull()
  })
})
