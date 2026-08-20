// @vitest-environment jsdom
/**
 * Manage → Roles & Access: the panel that grants and revokes editing access, and (for Site
 * Administrators) appoints and vacates a Subject Administrator.
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

const { RolesAccessPanel } = await import('@/components/Manage/RolesAccessPanel')
const { toWidgetUser, personLabel } = await import('@/lib/widgetUser')
type RolesAccess = import('@/lib/editorGroups').RolesAccess

/** Two people who share a display name — the case the address exists to resolve. */
const ada = { id: 1, name: 'A. Mwangi', email: 'ada.mwangi@school.test', updatedAt: 'T1' }
const alan = { id: 2, name: 'A. Mwangi', email: 'alan.mwangi@school.test', updatedAt: 'T2' }

/**
 * ⚑ THE PROPS ARE ID LISTS NOW (D11a): one shared roster plus per-group ids, so the payload is
 * users + subject-grades rather than their product. These helpers keep the tests reading in PEOPLE
 * while exercising the id→roster resolution the panel actually does — the alternative, hand-writing
 * id arrays in every case, would test the fixture rather than the component.
 */
const access = (over: {
  editors?: { id: number; name: string; email: string; updatedAt: string }[]
  addable?: { id: number; name: string; email: string; updatedAt: string }[]
  subjectAdmin?: { id: number; name: string; email: string; updatedAt: string }
}): RolesAccess => {
  const people = [
    ...(over.editors ?? []),
    ...(over.addable ?? []),
    ...(over.subjectAdmin ? [over.subjectAdmin] : []),
  ]
  return {
    roster: people.map(toWidgetUser),
    // Sent once for the whole payload; the panel derives each group's pool from it (D11a).
    grantableIds: (over.addable ?? []).map((u) => u.id),
    groups: [
      {
        sgId: 10,
        sgLabel: 'Biology — Grade 10',
        editorIds: (over.editors ?? []).map((u) => u.id),
        subjectAdminIds: over.subjectAdmin ? [over.subjectAdmin.id] : [],
      },
    ],
  }
}

afterEach(cleanup)

describe('Roles & Access identifies people by address, not just name', () => {
  it('shows the address beside each current editor', () => {
    const { container } = render(
      <RolesAccessPanel access={access({ editors: [ada, alan] })} canSetSubjectAdmin={false} />,
    )
    const shown = [...container.querySelectorAll('.lp-manage__who-email')].map((e) => e.textContent)
    expect(shown).toEqual(['ada.mwangi@school.test', 'alan.mwangi@school.test'])
  })

  it('shows the address in the GRANT PICKER, where the choice is made', () => {
    // The regression this file was written for. With names alone these two options are literally
    // indistinguishable — identical text, and only the value differs.
    render(
      <RolesAccessPanel access={access({ addable: [ada, alan] })} canSetSubjectAdmin={false} />,
    )
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
      render(<RolesAccessPanel access={access({ editors: [ada] })} canSetSubjectAdmin={false} />)
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
    render(
      <RolesAccessPanel access={access({ editors: [ada, alan] })} canSetSubjectAdmin={false} />,
    )
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
    render(<RolesAccessPanel access={access({ addable: [ada] })} canSetSubjectAdmin={false} />)
    const add = screen.getByRole('button', {
      name: 'Grant editing access in Biology — Grade 10',
    })
    expect(add.textContent).toBe('Add')
  })

  it('falls back to the bare name when a user record has no address', () => {
    // Not every account necessarily has one; the option must not read "Name — undefined".
    render(
      <RolesAccessPanel
        access={access({ addable: [{ id: 3, name: 'No Address', email: '', updatedAt: 'T' }] })}
        canSetSubjectAdmin={false}
      />,
    )
    const options = [...screen.getAllByRole('option')].map((o) => o.textContent)
    expect(options).toContain('No Address')
    expect(options.join(' ')).not.toMatch(/undefined|—\s*$/)
  })

  it('renders no address markup when the server sent none', () => {
    const { container } = render(
      <RolesAccessPanel
        access={access({ editors: [{ id: 4, name: 'Nameless', email: '', updatedAt: 'T' }] })}
        canSetSubjectAdmin={false}
      />,
    )
    expect(container.querySelector('.lp-manage__who-email')).toBeNull()
  })

  it('puts the empty-state message in the same row as the picker', () => {
    // The density fix (operator report 2026-08-02): stacked, an empty subject-grade cost ~104px for
    // one sentence and one control. Asserted structurally so a later refactor cannot quietly restack
    // it — with a full curriculum most groups are empty, so this is the common shape.
    const { container } = render(
      <RolesAccessPanel access={access({ addable: [ada] })} canSetSubjectAdmin={false} />,
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
      <RolesAccessPanel access={access({ editors: [ada] })} canSetSubjectAdmin={false} />,
    )
    const remove = screen.getByRole('button', { name: /^Remove editing access for/ })
    expect(remove.className).toContain('lp-btn')
    expect(remove.className).toContain('lp-btn--compact')
    expect(container.querySelector('.lp-manage__row--tight')).not.toBeNull()
  })
})

/**
 * ⚑ D6a's PRESENTATION HALF. The server rule is `enforceAssignmentScope` plus the route's own
 * `assertSiteAdmin`, both pinned in `tests/http`. What these assert is the other requirement the
 * decision makes explicitly: a Subject Administrator must SEE who administers their subject-grade —
 * useful, scoped information they already hold — with no control inviting them to change it. A guard
 * that refuses the write while the UI still offers the button produces an administrator who clicks,
 * sees an error, and concludes the app is broken.
 */
describe('Subject Administrator: shown to everyone, changeable only by a Site Admin', () => {
  it('shows the current administrator read-only when the viewer may not set it', () => {
    render(<RolesAccessPanel access={access({ subjectAdmin: ada })} canSetSubjectAdmin={false} />)
    expect(screen.getByText('Subject Administrator')).toBeTruthy()
    expect(screen.getByText('ada.mwangi@school.test')).toBeTruthy()
    // No picker and no remove control — the two things D6a names.
    expect(screen.queryByRole('combobox', { name: /Appoint the Subject Administrator/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /as Subject Administrator/ })).toBeNull()
  })

  it('offers the picker and a remove control to a Site Admin', () => {
    render(
      <RolesAccessPanel
        access={access({ subjectAdmin: ada, addable: [alan] })}
        canSetSubjectAdmin
      />,
    )
    expect(
      screen.getByRole('combobox', {
        name: 'Appoint the Subject Administrator of Biology — Grade 10',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Remove .* as Subject Administrator of/ }),
    ).toBeTruthy()
  })

  it('says so plainly when a subject-grade has no administrator', () => {
    render(<RolesAccessPanel access={access({})} canSetSubjectAdmin />)
    expect(screen.getByText('No administrator.')).toBeTruthy()
  })

  /**
   * Appointing demotes the incumbent through `autoDemotePriorSubjectAdmins`. That is a consequence of
   * the gentler-sounding action, so the confirmation names it — the same reasoning as the
   * subject-grade delete cascade warning in PR 3.
   */
  it('names the demotion of the incumbent in the confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      render(
        <RolesAccessPanel
          access={access({ subjectAdmin: ada, addable: [alan] })}
          canSetSubjectAdmin
        />,
      )
      const picker = screen.getByRole('combobox', {
        name: 'Appoint the Subject Administrator of Biology — Grade 10',
      })
      ;(picker as HTMLSelectElement).value = '2'
      picker.dispatchEvent(new Event('change', { bubbles: true }))
      screen.getByRole('button', { name: /^Appoint the Subject Administrator/ }).click()
      // ⚑ ASSERT THE INCUMBENT'S ADDRESS, not just the sentence. The confirmation named the person
      // being DEMOTED by `.name` alone while every other dialog in this file used `personLabel` — the
      // exact invariant this spec exists for, lost in the newest string because the old assertion
      // only checked the phrase.
      expect(confirmSpy.mock.calls[0]?.[0]).toContain('demoted to editing access')
      expect(confirmSpy.mock.calls[0]?.[0]).toContain('ada.mwangi@school.test')
    } finally {
      confirmSpy.mockRestore()
    }
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
