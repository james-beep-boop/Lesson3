// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// Favorite stars (rows with a version) refresh through the router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

import LibraryBrowser from '@/app/(frontend)/LibraryBrowser'
import type { LessonRow } from '@/lib/substrand'

const rows: LessonRow[] = [
  { id: 1, subjectName: 'Biology', grade: 10, substrandName: 'Cells', lessonCount: 1 },
  { id: 2, subjectName: 'Biology', grade: 11, substrandName: 'Genetics', lessonCount: 1 },
  { id: 3, subjectName: 'Chemistry', grade: 12, substrandName: 'Acids', lessonCount: 1 },
].map((row) => ({ ...row, substrandId: '1.1', strandName: 'Science' }))

function browse(grade = '', subject = '') {
  return render(
    <LibraryBrowser
      rows={rows}
      pinnedRows={[]}
      favPairs={[]}
      initial={{ q: '', subject, grade }}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('library filters', () => {
  it('starts at All, supports multiple grades, and restores All after the last is unchecked', () => {
    browse()
    const all = screen.getByRole('checkbox', { name: 'All' }) as HTMLInputElement
    expect(all.checked).toBe(true)
    expect((screen.getByRole('combobox', { name: 'Subject' }) as HTMLSelectElement).value).toBe('')

    fireEvent.click(screen.getByRole('checkbox', { name: '10' }))
    expect(all.checked).toBe(false)
    expect(screen.queryByText('Genetics')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '11' }))
    expect(screen.getByText('Cells')).toBeTruthy()
    expect(screen.getByText('Genetics')).toBeTruthy()
    expect(screen.queryByText('Acids')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: '10' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '11' }))
    expect(all.checked).toBe(true)
    expect(screen.getByText('Acids')).toBeTruthy()
  })

  it('All clears individual grades and cannot leave every checkbox unchecked', () => {
    browse('10,11')
    fireEvent.click(screen.getByRole('checkbox', { name: 'All' }))
    for (const name of ['10', '11', '12']) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(false)
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'All' }))
    expect((screen.getByRole('checkbox', { name: 'All' }) as HTMLInputElement).checked).toBe(true)
  })

  it('combines multiple grades, a subject, and search without shrinking the available options', () => {
    browse('10,11')
    fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), {
      target: { value: 'Biology' },
    })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'genetics' } })
    expect(screen.getByText('Genetics')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
    expect(screen.queryByText('Acids')).toBeNull()
    expect(screen.getByRole('option', { name: 'Chemistry' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '12' })).toBeTruthy()
    // Chemistry has no Grade 10 or 11 plans at all: that is "not available yet", not "no match".
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Chemistry' } })
    expect(
      screen.getByText('No Grade 10 or Grade 11 Chemistry lesson plans are available yet.'),
    ).toBeTruthy()
  })

  it('a search that excludes existing plans says they do not match', () => {
    browse('10')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('No lesson plans match “zzz” with these filters.')).toBeTruthy()
  })

  it('round-trips multiple grades in the URL and restores a legacy single-grade URL on navigation', () => {
    vi.useFakeTimers()
    browse()
    fireEvent.click(screen.getByRole('checkbox', { name: '11' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '10' }))
    vi.advanceTimersByTime(250)
    expect(new URLSearchParams(window.location.search).get('grade')).toBe('10,11')

    // A pending write must not overwrite the restored history entry.
    fireEvent.click(screen.getByRole('checkbox', { name: '12' }))
    window.history.replaceState(null, '', '/?grade=12&subject=Chemistry')
    fireEvent(window, new PopStateEvent('popstate'))
    vi.advanceTimersByTime(250)
    expect(new URLSearchParams(window.location.search).get('grade')).toBe('12')
    expect((screen.getByRole('checkbox', { name: '12' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Acids')).toBeTruthy()
    expect(screen.queryByText('Genetics')).toBeNull()
  })

  it('treats invalid or unavailable grades as All', () => {
    browse('abc,99')
    expect((screen.getByRole('checkbox', { name: 'All' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Cells')).toBeTruthy()
  })

  it('treats an unavailable subject as All on first render and history navigation', () => {
    browse('', 'Physics')
    const select = screen.getByRole('combobox', { name: 'Subject' }) as HTMLSelectElement
    expect(select.value).toBe('')
    expect(screen.getByText('Cells')).toBeTruthy()
    expect(screen.getByText('Acids')).toBeTruthy()

    fireEvent.change(select, { target: { value: 'Biology' } })
    expect(screen.queryByText('Acids')).toBeNull()
    window.history.replaceState(null, '', '/?subject=Physics&grade=12')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(select.value).toBe('')
    expect(screen.getByText('Acids')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
  })

  it('always offers Grades 10, 11 and 12, and keeps grade=12 selected with no Grade 12 plans', () => {
    render(
      <LibraryBrowser
        rows={rows.filter((r) => r.grade === 10)}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '12' }}
      />,
    )
    for (const name of ['10', '11', '12'])
      expect(screen.getByRole('checkbox', { name })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: '12' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('No Grade 12 lesson plans are available yet.')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show all grades' }))
    expect(screen.getByText('Cells')).toBeTruthy()
  })

  it('offers a grade outside 10 to 12 when a plan exists at it', () => {
    render(
      <LibraryBrowser
        rows={[...rows, { ...rows[0], id: 9, grade: 9, substrandName: 'Plants' }]}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '9' }}
      />,
    )
    expect((screen.getByRole('checkbox', { name: '9' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Plants')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
  })
})

describe('All lesson plans and My favorites', () => {
  const withVersions = rows.map((r) => ({ ...r, versionId: Number(r.id) * 10 }))

  it('switches views without a history entry, applies the filters to both, and writes view= to the URL', () => {
    vi.useFakeTimers()
    const before = window.history.length
    render(
      <LibraryBrowser
        rows={withVersions}
        pinnedRows={[]}
        favPairs={[[20, 1]]}
        initial={{ q: '', subject: '', grade: '' }}
      />,
    )
    const all = screen.getByRole('button', { name: 'All lesson plans' })
    const favs = screen.getByRole('button', { name: 'My favorites' })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('3 plans')).toBeTruthy()

    fireEvent.click(favs)
    expect(favs.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Genetics')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
    expect(screen.getByText('1 plan')).toBeTruthy()
    vi.advanceTimersByTime(250)
    expect(new URLSearchParams(window.location.search).get('view')).toBe('favorites')
    expect(window.history.length).toBe(before)

    fireEvent.click(screen.getByRole('checkbox', { name: '10' }))
    expect(screen.queryByText('Genetics')).toBeNull()
    expect(screen.getByText('No lesson plans match these filters.')).toBeTruthy()
  })

  it('says how to add a favorite when there are none', () => {
    render(
      <LibraryBrowser
        rows={withVersions}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '', view: 'favorites' }}
      />,
    )
    expect(screen.getByText(/No favorites yet/)).toBeTruthy()
  })
})

describe('catalogue groups and the resume row', () => {
  it('opens every strand group on arrival', () => {
    const { container } = browse()
    const groups = container.querySelectorAll('details.strand-section')
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) expect((g as HTMLDetailsElement).open).toBe(true)
  })

  it('shows one resume link only when there is work, worded by whether it can be restored', () => {
    const { rerender } = render(
      <LibraryBrowser
        rows={rows}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '' }}
      />,
    )
    expect(screen.queryByText(/Pick up where you left off/)).toBeNull()
    const href = '/admin/collections/lesson-bundle-versions/7?edit=1'
    rerender(
      <LibraryBrowser
        rows={rows}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '' }}
        resume={{ label: 'Cells', href, restorable: true }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Continue editing Cells' }).getAttribute('href')).toBe(
      href,
    )
    rerender(
      <LibraryBrowser
        rows={rows}
        pinnedRows={[]}
        favPairs={[]}
        initial={{ q: '', subject: '', grade: '' }}
        resume={{ label: 'Cells', href, restorable: false }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Open to copy Cells' })).toBeTruthy()
  })
})
