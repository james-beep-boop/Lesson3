// @vitest-environment jsdom
/**
 * Manage → Editing access: the widget that grants and revokes editing access.
 *
 * These tests exist for ONE property, and it is an authorization-UX one rather than a styling one:
 * **every user shown in this widget is identified by name AND email address, in both places a
 * choice is made** — the current-editors rows and the grant picker's options.
 *
 * Why that needs a test. Granting editing access is an authorization decision, and a display name
 * is not an identifier: two teachers can share one. A name-only control lets an administrator grant
 * edit rights over a subject's content to the wrong person with nothing on screen to reveal the
 * mistake. The addresses were added to the ROWS first and the picker was missed (review 2026-08-02)
 * — the rows are where you notice the error afterwards, the picker is where you make it. So the
 * picker is the assertion that matters most here.
 *
 * SPEC §8 carve-out (operator decision 2026-08-02): this reaches Subject Administrators too, not
 * only Site Admins. `emailReadAccess` on the collection is unchanged, so the carve-out is confined
 * to this view — see `lib/widgetUser.ts` and SPEC §8.
 *
 * `@payloadcms/ui` is stubbed. The real module imports CSS that the unit-test config cannot load
 * (`react-image-crop/dist/ReactCrop.css`), and reworking the shared vitest config to render one
 * `<select>` is the wrong trade. Only `Button` is load-bearing for these assertions, and it is
 * stubbed as the plain `<button>` it renders.
 */
import React from 'react'
import { render, screen, cleanup, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  // Forwards `aria-label` because Payload's real Button does (verified in installed source:
  // elements/Button/index.js sets 'aria-label': ariaLabel on the element). A stub that dropped it
  // would make the accessible-name tests below pass against markup that has no label.
  Button: ({
    children,
    className,
    onClick,
    disabled,
    'aria-label': ariaLabel,
  }: {
    children?: React.ReactNode
    className?: string
    onClick?: () => void
    disabled?: boolean
    'aria-label'?: string
  }) => (
    <button
      className={`btn ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api' } } }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { EditorsWidget } = await import('@/components/AdminDashboard/EditorsWidget')
const { toWidgetUser, personLabel } = await import('@/lib/widgetUser')
type EditorsGroup = import('@/components/AdminDashboard/EditorsWidget').EditorsGroup

/** Two people who share a display name — the case the address exists to resolve. */
const ada = { id: 1, name: 'A. Mwangi', email: 'ada.mwangi@school.test', updatedAt: 'T1' }
const alan = { id: 2, name: 'A. Mwangi', email: 'alan.mwangi@school.test', updatedAt: 'T2' }

// Typed overrides: a `Record<string, unknown>` bag would let a typo'd key (`editor:`) compile
// silently, and forced two casts on the empty arrays.
const group = (over: Partial<EditorsGroup> = {}): EditorsGroup => ({
  sgId: 10,
  sgLabel: 'Biology — Grade 10',
  editors: [],
  addable: [],
  ...over,
})

afterEach(cleanup)

describe('Editing access identifies people by address, not just name', () => {
  it('shows the address beside each current editor', () => {
    const { container } = render(
      <EditorsWidget groups={[group({ editors: [toWidgetUser(ada), toWidgetUser(alan)] })]} />,
    )
    const shown = [...container.querySelectorAll('.lp-manage__who-email')].map((e) => e.textContent)
    expect(shown).toEqual(['ada.mwangi@school.test', 'alan.mwangi@school.test'])
  })

  it('shows the address in the GRANT PICKER, where the choice is made', () => {
    // The regression this file was written for. With names alone these two options are literally
    // indistinguishable — identical text, and only the value differs.
    render(<EditorsWidget groups={[group({ addable: [toWidgetUser(ada), toWidgetUser(alan)] })]} />)
    const picker = screen.getByRole('combobox', {
      name: 'Grant editing access for Biology — Grade 10',
    })
    const labels = [...within(picker).getAllByRole('option')].map((o) => o.textContent)
    const selectable = labels.slice(1)
    // Expectations come from `personLabel`, not a hard-coded em dash: the separator is a display
    // convention owned by that helper, and duplicating it here meant a convention change had to be
    // made in JSX and in a test with nothing linking them.
    expect(selectable).toEqual([personLabel(toWidgetUser(ada)), personLabel(toWidgetUser(alan))])
    // THE property, and the reason the exact strings above are not the point: no two selectable
    // options may read the same. With names alone this fails — both would be 'A. Mwangi'.
    expect(new Set(selectable).size, 'two grantable people must never render identically').toBe(
      selectable.length,
    )
  })

  it('identifies the person in the REMOVE confirmation, not just in the grant picker', () => {
    // Revoking access is the same kind of authorization decision as granting it, and this dialog is
    // the last thing before the change — yet it named people only by display name, so for `ada` and
    // `alan` it read identically for both (review 2026-08-02: the reasoning had been applied only
    // where the review pointed). Asserted on the confirm STRING because that is the whole control.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      render(<EditorsWidget groups={[group({ editors: [toWidgetUser(ada)] })]} />)
      screen.getByRole('button', { name: /^Remove editing access for/ }).click()
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(confirmSpy.mock.calls[0][0]).toContain('ada.mwangi@school.test')
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('gives each row\u2019s Remove button its own accessible name', () => {
    // Visually every Remove reads the same, which is correct — the row supplies the context. A
    // screen-reader user gets no row, so without a per-button name they meet N identical "Remove"
    // controls and cannot tell whose access they are revoking. Same defect as the name-only confirm
    // dialog, one layer down (CodeRabbit, PR #184): putting addresses on screen did nothing for
    // people not reading the screen.
    render(<EditorsWidget groups={[group({ editors: [toWidgetUser(ada), toWidgetUser(alan)] })]} />)
    const names = screen
      .getAllByRole('button', { name: /^Remove editing access for/ })
      .map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual([
      'Remove editing access for A. Mwangi — ada.mwangi@school.test in Biology — Grade 10',
      'Remove editing access for A. Mwangi — alan.mwangi@school.test in Biology — Grade 10',
    ])
    // THE property: two rows must never present the same accessible name.
    expect(new Set(names).size).toBe(names.length)
    // The visible text stays short — the label is for assistive tech, not a wider button.
    expect(
      screen.getAllByRole('button', { name: /^Remove editing access for/ })[0].textContent,
    ).toBe('Remove')
  })

  it('names the Add button by its subject-grade', () => {
    render(<EditorsWidget groups={[group({ addable: [toWidgetUser(ada)] })]} />)
    const add = screen.getByRole('button', {
      name: 'Grant editing access in Biology — Grade 10',
    })
    expect(add.textContent).toBe('Add')
  })

  it('falls back to the bare name when a user record has no address', () => {
    // Not every account necessarily has one; the option must not read "Name — undefined".
    render(
      <EditorsWidget
        groups={[group({ addable: [toWidgetUser({ id: 3, name: 'No Address', updatedAt: 'T' })] })]}
      />,
    )
    const options = [...screen.getAllByRole('option')].map((o) => o.textContent)
    expect(options).toContain('No Address')
    expect(options.join(' ')).not.toMatch(/undefined|—\s*$/)
  })

  it('renders no address markup when the server sent none', () => {
    const { container } = render(
      <EditorsWidget
        groups={[group({ editors: [toWidgetUser({ id: 4, name: 'Nameless', updatedAt: 'T' })] })]}
      />,
    )
    expect(container.querySelector('.lp-manage__who-email')).toBeNull()
  })

  it('puts the empty-state message in the same row as the picker', () => {
    // The density fix (operator report 2026-08-02): stacked, an empty subject-grade cost ~104px for
    // one sentence and one control. Asserted structurally so a later refactor cannot quietly restack
    // it — with a full curriculum most groups are empty, so this is the common shape.
    const { container } = render(
      <EditorsWidget groups={[group({ addable: [toWidgetUser(ada)] })]} />,
    )
    const addRow = container.querySelector('.lp-manage__editors-add')!
    expect(addRow.querySelector('.lp-manage__editors-none')?.textContent).toBe(
      'No one has editing access.',
    )
    expect(addRow.querySelector('select')).not.toBeNull()
  })

  it('gives Remove the compact button class, so the rows stay dense', () => {
    // Pairs with the ≤640px restatement guarded in guideCompareVisual.spec.tsx: this asserts the
    // class is APPLIED, that one asserts the class still reaches the 44px touch target on a phone.
    const { container } = render(
      <EditorsWidget groups={[group({ editors: [toWidgetUser(ada)] })]} />,
    )
    const remove = screen.getByRole('button', { name: /^Remove editing access for/ })
    expect(remove.className).toContain('lp-btn')
    expect(remove.className).toContain('lp-btn--compact')
    expect(container.querySelector('.lp-manage__row--tight')).not.toBeNull()
  })
})

describe('toWidgetUser', () => {
  it('carries id, name, address and the freshness token', () => {
    expect(toWidgetUser(ada)).toEqual({
      id: 1,
      name: 'A. Mwangi',
      email: 'ada.mwangi@school.test',
      updatedAt: 'T1',
    })
  })

  it('OMITS the email key rather than emitting null or an empty string', () => {
    // An empty string would still cross the wire and would render as a stray separator.
    for (const email of [null, undefined, '']) {
      const projected = toWidgetUser({ id: 5, name: 'X', email, updatedAt: 'T' })
      expect('email' in projected, `email=${JSON.stringify(email)} should omit the key`).toBe(false)
    }
  })

  it('falls back to a display name when the record has none', () => {
    expect(toWidgetUser({ id: 9, name: null, updatedAt: 'T' }).name).toBe('User 9')
  })

  it('takes no per-role flag — there is no way to project a user without their address', () => {
    // The reviewer's P3, answered by construction rather than by a watcher test: the previous
    // `includeEmail` boolean was true at every call site, so it could only ever be passed WRONG.
    // Deleting it removes the failure mode. This asserts the signature stays that way.
    expect(toWidgetUser.length, 'toWidgetUser must take exactly one argument').toBe(1)
  })
})
