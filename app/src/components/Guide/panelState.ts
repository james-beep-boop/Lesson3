/**
 * The guide's small, closed panel vocabulary and incoming deep-link parser.
 *
 * Guide links only need to open a known panel and optionally focus one known task. Panel toggles
 * remain local UI state; the guide does not mirror every click into browser history.
 */
export const GUIDE_PANEL_IDS = [
  'teachers',
  'teachers.sign-in',
  'teachers.find-read',
  'teachers.favorites',
  'teachers.documents',
  'teachers.messages',
  'teachers.request-editing',
  'editing',
  'editing.open-edit',
  'editing.save',
  'editing.saved-versions',
  'editing.recovery',
  'editing.compare',
  'editing.writing',
  'subject-admins',
  'subject-admins.promote',
  'subject-admins.structure',
  'subject-admins.access',
  'subject-admins.handover',
  'subject-admins.candidates',
  'site-admins',
  'site-admins.first-admin',
  'site-admins.accounts',
  'site-admins.passwords',
  'site-admins.roles',
  'site-admins.curriculum',
  'site-admins.upload',
  'site-admins.repair',
  'site-admins.delete',
  'site-admins.system',
  'role-notes',
] as const

export type GuidePanelId = (typeof GUIDE_PANEL_IDS)[number]

const GUIDE_PANEL_ID_SET: ReadonlySet<string> = new Set(GUIDE_PANEL_IDS)

export function isGuidePanelId(value: string): value is GuidePanelId {
  return GUIDE_PANEL_ID_SET.has(value)
}

export function parentOf(id: GuidePanelId): GuidePanelId | null {
  const dot = id.indexOf('.')
  return dot === -1 ? null : (id.slice(0, dot) as GuidePanelId)
}

export function withAncestors(ids: Iterable<GuidePanelId>): GuidePanelId[] {
  const open = new Set<GuidePanelId>()
  for (const id of ids) {
    open.add(id)
    const parent = parentOf(id)
    if (parent) open.add(parent)
  }
  return GUIDE_PANEL_IDS.filter((id) => open.has(id))
}

export function resolveGuidePanelState(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  available: readonly GuidePanelId[],
): { open: GuidePanelId[]; focusTarget: GuidePanelId | null } {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value == null) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }

  const allowed = new Set(available)
  const requested = query
    .getAll('open')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is GuidePanelId => isGuidePanelId(value) && allowed.has(value))

  const rawTarget = query.get('at')
  const focusTarget =
    rawTarget && isGuidePanelId(rawTarget) && allowed.has(rawTarget) ? rawTarget : null
  if (focusTarget) requested.push(focusTarget)

  return { open: withAncestors(requested), focusTarget }
}
