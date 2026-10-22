// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

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
    expect((screen.getByRole('combobox', { name: 'Subjects:' }) as HTMLSelectElement).value).toBe(
      '',
    )

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
    fireEvent.change(screen.getByRole('combobox', { name: 'Subjects:' }), {
      target: { value: 'Biology' },
    })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'genetics' } })
    expect(screen.getByText('Genetics')).toBeTruthy()
    expect(screen.queryByText('Cells')).toBeNull()
    expect(screen.queryByText('Acids')).toBeNull()
    expect(screen.getByRole('option', { name: 'Chemistry' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '12' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Chemistry' } })
    expect(screen.getByText('No lesson plans match these filters.')).toBeTruthy()
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
    const select = screen.getByRole('combobox', { name: 'Subjects:' }) as HTMLSelectElement
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
})
