/**
 * Thread pagination and the range a page may mark read (`src/lib/discussionPaging.ts`; 4a contract).
 *
 * ⚑ THE LOAD-BEARING CASES (GPT review 2026-10-10): a thread opens at the page holding
 * `lastReadSeq + 1`, never past it; page 1 marks from the opening post (seq 0) and a later page from its
 * own first reply, so opening a later page directly cannot mark what was skipped; and the 50/51 boundary.
 */
import { describe, expect, it } from 'vitest'

import {
  entryPage,
  markRangeFor,
  pageOfSeq,
  parsePage,
  postHref,
  replyPageCount,
  replySeqsOn,
} from '../../src/lib/discussionPaging.js'

describe('pages', () => {
  it('holds 50 replies a page, and every thread has a page 1', () => {
    expect([0, 1, 50, 51, 100, 101].map(replyPageCount)).toEqual([1, 1, 1, 2, 2, 3])
    expect([0, 1, 50, 51, 100, 101].map(pageOfSeq)).toEqual([1, 1, 1, 2, 2, 3])
    expect(replySeqsOn(1, 0)).toBeNull()
    expect(replySeqsOn(1, 51)).toEqual({ first: 1, last: 50 })
    expect(replySeqsOn(2, 51)).toEqual({ first: 51, last: 51 })
    expect(replySeqsOn(3, 51)).toBeNull()
  })

  it('accepts only a whole page number within the thread', () => {
    expect(parsePage('2', 51)).toBe(2)
    expect(parsePage('3', 51)).toBeNull()
    for (const bad of [undefined, '', '0', '-1', '1.5', '02', 'x', '9999999']) {
      expect(parsePage(bad, 51), String(bad)).toBeNull()
    }
  })
})

describe('entryPage — the page holding lastReadSeq + 1', () => {
  it('opens a non-participant and an invited author (−1) at page 1', () => {
    expect(entryPage(null, 120)).toBe(1)
    expect(entryPage(-1, 120)).toBe(1)
  })

  it('crosses to the next page exactly at the boundary', () => {
    expect(entryPage(49, 120)).toBe(1) // next unread is 50, on page 1
    expect(entryPage(50, 120)).toBe(2) // next unread is 51, on page 2
    expect(entryPage(100, 120)).toBe(3)
  })

  it('lands on the last page once everything is read', () => {
    expect(entryPage(51, 51)).toBe(2)
    expect(entryPage(50, 50)).toBe(1)
    expect(entryPage(0, 0)).toBe(1)
  })
})

describe('markRangeFor — exactly what the page displayed', () => {
  it('page 1 starts at the opening post', () => {
    expect(markRangeFor(1, 0)).toEqual({ fromSeq: 0, throughSeq: 0 })
    expect(markRangeFor(1, 51)).toEqual({ fromSeq: 0, throughSeq: 50 })
  })

  it('a later page starts at its own first reply — never at 0', () => {
    expect(markRangeFor(2, 51)).toEqual({ fromSeq: 51, throughSeq: 51 })
    expect(markRangeFor(3, 120)).toEqual({ fromSeq: 101, throughSeq: 120 })
  })

  it('a page with no replies marks nothing', () => {
    expect(markRangeFor(3, 51)).toBeNull()
  })
})

describe('postHref', () => {
  it('points at the page and anchor holding the post', () => {
    expect(postHref(5, 0)).toBe('/discuss/5?page=1#post-0')
    expect(postHref(5, 73)).toBe('/discuss/5?page=2#reply-73')
  })
})
