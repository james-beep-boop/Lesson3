import { describe, expect, it } from 'vitest'

import { resolveGuidePanelState } from '@/components/Guide/panelState'

const teacherPanels = ['teachers', 'teachers.find-read', 'editing', 'role-notes'] as const

describe('guide deep links', () => {
  it('opens an available task and its parent, then focuses the requested task', () => {
    expect(
      resolveGuidePanelState({ open: 'editing', at: 'editing.writing' }, [
        ...teacherPanels,
        'editing.writing',
      ]),
    ).toEqual({
      open: ['editing', 'editing.writing'],
      focusTarget: 'editing.writing',
    })
  })

  it('ignores unknown panels and tasks a user cannot access', () => {
    expect(
      resolveGuidePanelState(
        { open: ['site-admins.accounts', 'not-a-panel'], at: 'editing.writing' },
        teacherPanels,
      ),
    ).toEqual({ open: [], focusTarget: null })
  })

  it('accepts multiple and comma-separated open panels', () => {
    expect(
      resolveGuidePanelState({ open: ['teachers.find-read,role-notes', 'editing'] }, teacherPanels)
        .open,
    ).toEqual(['teachers', 'teachers.find-read', 'editing', 'role-notes'])
  })
})
