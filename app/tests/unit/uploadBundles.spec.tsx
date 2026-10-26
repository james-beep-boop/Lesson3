// @vitest-environment jsdom
/**
 * Manage → Upload lesson plans: the stale-results defect (operator report 2026-08-02).
 *
 * After a successful upload the panel kept the PREVIOUS upload's result list on screen. The file
 * picker was reset, so the panel read as though those files were still queued — an administrator
 * could reasonably think they were about to re-upload them.
 *
 * The fix clears the results when the picker is OPENED (`onClick`), not when files arrive
 * (`onChange`). That distinction is the whole point and it is what this file pins: `onChange` alone
 * leaves the stale list on screen for as long as the OS dialog is open, and leaves it there
 * permanently if the administrator CANCELS the dialog — the case with no `change` event at all.
 *
 * Verified manually against a real 573KB ARES file before this test existed; the test is here so it
 * stays fixed.
 *
 * `@payloadcms/ui` is stubbed: the real module imports CSS the unit-test config cannot load. Only
 * `Button`, `toast` and `useAuth`/`useConfig` are needed, and each is stubbed as what it renders or
 * returns.
 */
import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from '@payloadcms/ui'

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
  }) => (
    <button className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  // Site Admin — the panel renders nothing for anyone else.
  useAuth: () => ({ user: { id: 1, roles: ['siteAdmin'] } }),
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api' } } }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const UploadBundles = (await import('@/components/UploadBundles')).default

/** One successful upload response, matching the endpoint's shape. */
const okResponse = {
  ok: true,
  count: 1,
  rejected: [],
  skipped: [],
  bundles: [
    {
      file: 'cell_structure.json',
      id: 42,
      title: 'BIOLOGY GRADE 10: CELL STRUCTURE',
      semver: '1.0.0',
      official: true,
      action: 'created' as const,
      warnings: [],
    },
  ],
}

const pickFile = (input: HTMLInputElement, name: string) => {
  const file = new File(['{}'], name, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

/** The result list's rendered text, or '' when no list is shown. */
const resultsText = (container: HTMLElement) => container.querySelector('ul')?.textContent ?? ''

/** Drive one upload to completion and assert the result list is on screen. */
const uploadOnce = async (container: HTMLElement) => {
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  pickFile(input, 'cell_structure.json')
  fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
  await waitFor(() => expect(resultsText(container)).toContain('CELL STRUCTURE'))
  return input
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(okResponse), { status: 200 })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('upload results do not outlive the upload', () => {
  it('shows the result list after a successful upload', async () => {
    const { container } = render(<UploadBundles />)
    await uploadOnce(container)
    // Sanity: the fix must not be "never show results at all".
    expect(resultsText(container)).toContain('#42')
  })

  it('clears the previous results when the picker OPENS, and stays clear if it is cancelled', async () => {
    // THE regression. `click` is the picker opening — no `change` yet, and there may never be one.
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)

    // Opening the picker is the ONLY event here — `click`, never `change`. If the administrator then
    // CANCELS, no further event ever arrives, so this same assertion is also the cancel case: an
    // `onChange`-only fix leaves the stale list on screen permanently. One simulation, both facts.
    fireEvent.click(input)

    // No `waitFor`: `setResults([])` is flushed inside `act` by `fireEvent`, and a `waitFor` around a
    // `.not.toContain` would pass on its first tick regardless — implying a guarantee it never made.
    expect(resultsText(container)).not.toContain('CELL STRUCTURE')
    expect(resultsText(container)).not.toContain('#42')
    expect(
      (screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled,
      'the picker is empty again, so Upload is unavailable',
    ).toBe(true)
  })

  it('also clears on change, for paths that set files without a click', async () => {
    // Drag-and-drop and programmatic assignment do not open the picker. Belt and braces: the two
    // handlers cover different entry points rather than duplicating one.
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)

    pickFile(input, 'another.json')

    expect(resultsText(container)).not.toContain('#42')
  })

  it('resets the picker after a successful upload so the same files cannot be re-sent', async () => {
    const { container } = render(<UploadBundles />)
    const input = await uploadOnce(container)
    expect(input.value).toBe('')
    expect((screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('partial upload reporting', () => {
  it('shows successes, rejection reasons and skipped files for a mixed ZIP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...okResponse,
          bundles: [{ ...okResponse.bundles[0], file: 'lessons.zip/good.json' }],
          rejected: [{ file: 'lessons.zip/bad.json', error: 'Malformed JSON' }],
          skipped: [{ file: 'lessons.zip/readme.txt', error: 'Not a JSON lesson-plan file' }],
        }),
      ),
    )
    const { container } = render(<UploadBundles />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    expect(input.accept).toContain('.zip')
    pickFile(input, 'lessons.zip')
    fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
    await screen.findByText('Imported 1 file(s); rejected 1; skipped 1.')
    expect(container.textContent).toContain('lessons.zip/good.json')
    expect(container.textContent).toContain('lessons.zip/bad.json')
    expect(container.textContent).toContain('Malformed JSON')
    expect(container.textContent).toContain('lessons.zip/readme.txt')
    fireEvent.click(input)
    expect(container.textContent).not.toContain('Malformed JSON')
  })

  it('reports an entirely unchanged ZIP as success and clears the picker', async () => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ok: true,
          count: 0,
          bundles: [],
          rejected: [],
          skipped: [
            { file: 'same.zip/plan.json', error: 'Unchanged — matches latest saved version 1.0.0' },
          ],
        }),
      ),
    )
    const { container } = render(<UploadBundles />)
    pickFile(container.querySelector('input[type=file]') as HTMLInputElement, 'same.zip')
    fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
    await screen.findByText('Imported 0 file(s); rejected 0; skipped 1.')
    expect(container.textContent).toContain('Unchanged — matches latest saved version 1.0.0')
    expect(toast.success).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('keeps a per-file report when every file is rejected (422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            ok: false,
            count: 0,
            bundles: [],
            rejected: [{ file: 'bad.json', error: 'Missing META' }],
            skipped: [],
            error: 'No files were imported.',
          },
          { status: 422 },
        ),
      ),
    )
    const { container } = render(<UploadBundles />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    pickFile(input, 'bad.json')
    fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
    await screen.findByText('Imported 0 file(s); rejected 1; skipped 0.')
    expect(container.textContent).toContain('Missing META')
    expect((screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('missing subjects and grades (SPEC §7, amended 2026-10-21)', () => {
  const confirmation = {
    ok: false,
    needsConfirmation: true,
    count: 0,
    bundles: [],
    created: [],
    rejected: [],
    skipped: [],
    missing: [
      { subject: 'Geography', grade: 9, newSubject: true, similarTo: [], files: ['a.json'] },
      {
        subject: 'Maths',
        grade: 9,
        newSubject: true,
        similarTo: ['Mathematics'],
        files: ['b.json', 'c.json'],
      },
      { subject: 'Biology', grade: 11, newSubject: false, similarTo: [], files: ['d.json'] },
    ],
  }

  /** Upload once against a 409, returning the fetch mock so the resubmission can be inspected. */
  const ask = async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json(confirmation, { status: 409 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<UploadBundles />)
    pickFile(container.querySelector('input[type=file]') as HTMLInputElement, 'lessons.zip')
    fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
    await screen.findByRole('group', { name: 'Create missing subjects and grades?' })
    return { container, fetchMock }
  }
  type FetchMock = Awaited<ReturnType<typeof ask>>['fetchMock']
  const sentApprovals = (fetchMock: FetchMock) => {
    const form = fetchMock.mock.calls.at(-1)![1].body as FormData
    return JSON.parse(form.get('createTaxonomy') as string)
  }

  it('asks once, and refuses to send until the similar-named subject is answered', async () => {
    const { fetchMock } = await ask()
    const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement
    expect(box('Create Geography — Grade 9 (1 file)').checked).toBe(true)
    expect(box('Create Biology — Grade 11 (1 file)').checked).toBe(true)
    expect(box('Create Maths — Grade 9 (2 files)').checked).toBe(false)
    expect(box('Create Maths — Grade 9 (2 files)').disabled).toBe(true)
    expect(screen.getByText(/a misspelling of “Mathematics”/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /^Create \d+ and import$/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    // The first request carried no approvals at all.
    expect((fetchMock.mock.calls[0]![1].body as FormData).has('createTaxonomy')).toBe(false)
  })

  it('a misspelling is never sent for creation; the rest are', async () => {
    const { fetchMock } = await ask()
    fireEvent.click(screen.getByLabelText(/A misspelling/))
    fetchMock.mockImplementation(async () =>
      Response.json({ ...okResponse, created: [] }, { status: 200 }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 and import' }))
    await screen.findByText(/Imported 1 file\(s\)/)
    expect(sentApprovals(fetchMock)).toEqual([
      { subject: 'Geography', grade: 9 },
      { subject: 'Biology', grade: 11 },
    ])
  })

  it('answering "new subject" ticks its grades and sends them', async () => {
    const { fetchMock } = await ask()
    fireEvent.click(screen.getByLabelText('A new subject'))
    fireEvent.click(screen.getByLabelText('Create Geography — Grade 9 (1 file)')) // untick one
    fetchMock.mockImplementation(async () =>
      Response.json({ ...okResponse, created: [] }, { status: 200 }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 and import' }))
    await screen.findByText(/Imported 1 file\(s\)/)
    expect(sentApprovals(fetchMock)).toEqual([
      { subject: 'Maths', grade: 9 },
      { subject: 'Biology', grade: 11 },
    ])
  })

  it('Cancel sends nothing and clears the picker', async () => {
    const { container, fetchMock } = await ask()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('Create missing subjects')
    expect((screen.getByRole('button', { name: /^Upload/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('Official-only confirmation', () => {
  it('asks for the Official move and resubmits its token without offering taxonomy creation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            needsConfirmation: true,
            missing: [],
            previewToken: 'bound-token',
            official: [
              {
                file: 'a.json',
                title: 'Cell structure',
                decision: 'new',
                willMove: true,
                previousSemver: '1.0.0',
                incomingSemver: '2.0.0',
                fingerprint: 'ares-content-v1:sha256:a',
                release: null,
              },
            ],
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json(okResponse))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<UploadBundles />)
    pickFile(container.querySelector('input[type=file]') as HTMLInputElement, 'a.json')
    fireEvent.click(screen.getByRole('button', { name: /^Upload/ }))
    await screen.findByRole('button', { name: /^Confirm$/ })
    expect(container.textContent).toContain('1.0.0 → 2.0.0 · ARES release: not stated')
    expect(container.textContent).not.toContain('Tick what to create')
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect((fetchMock.mock.calls[1][1]!.body as FormData).get('confirmOfficial')).toBe(
      'bound-token',
    )
  })
})
