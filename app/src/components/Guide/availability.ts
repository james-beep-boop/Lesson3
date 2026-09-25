import type { User } from '@/payload-types'

import { editingAccessScopeIds, isSiteAdmin, isSubjectAdminForAny } from '@/access'

import { withAncestors, type GuidePanelId } from './panelState'

/**
 * The guide's detailed tasks follow the same capabilities as the app. The five top-level headings
 * are always present as orientation; this list additionally controls which task panels are rendered.
 */
export function computeGuideAvailablePanels(user: User): GuidePanelId[] {
  const siteAdmin = isSiteAdmin(user)
  const subjectAdmin = isSubjectAdminForAny(user)
  // A Subject Admin and a Site Admin can both edit prose even without an explicit editor assignment.
  const canEdit = siteAdmin || subjectAdmin || editingAccessScopeIds(user).length > 0

  const availableLeaves: (GuidePanelId | false)[] = [
    'teachers.sign-in',
    'teachers.find-read',
    'teachers.favorites',
    'teachers.documents',
    'teachers.messages',
    'teachers.request-editing',

    canEdit && 'editing.open-edit',
    canEdit && 'editing.save',
    canEdit && 'editing.saved-versions',
    canEdit && 'editing.recovery',
    canEdit && 'editing.compare',
    canEdit && 'editing.writing',

    (siteAdmin || subjectAdmin) && 'subject-admins.promote',
    (siteAdmin || subjectAdmin) && 'subject-admins.structure',
    (siteAdmin || subjectAdmin) && 'subject-admins.access',
    // Site Admins use the full appoint/replace/remove controls, not the self-demotion handover flow.
    subjectAdmin && !siteAdmin && 'subject-admins.handover',
    (siteAdmin || subjectAdmin) && 'subject-admins.candidates',

    siteAdmin && 'site-admins.first-admin',
    siteAdmin && 'site-admins.accounts',
    siteAdmin && 'site-admins.passwords',
    siteAdmin && 'site-admins.roles',
    siteAdmin && 'site-admins.curriculum',
    siteAdmin && 'site-admins.upload',
    siteAdmin && 'site-admins.repair',
    siteAdmin && 'site-admins.delete',
    siteAdmin && 'site-admins.system',
  ]

  return withAncestors([
    'teachers',
    'editing',
    'subject-admins',
    'site-admins',
    'role-notes',
    ...availableLeaves.filter((id): id is GuidePanelId => id !== false),
  ])
}
