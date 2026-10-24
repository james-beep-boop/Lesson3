/**
 * NATIVE DOCUMENT LOCKS — access for Payload's generated `payload-locked-documents` collection.
 * Audit F-C22-002 (2026-10-24); operator decisions: DECISIONS 2026-10-24 "Native document locks".
 *
 * Payload generates the collection with any-signed-in-user create/read/update/delete, and its REST
 * update/delete of a locked document answer 423 while another user's lock is fresh. So any Teacher
 * could POST a lock in anyone's name, keep it fresh, and block an administrator's delete. This closes
 * the API to everything the native editing UI does not need. What the UI does, verified in installed
 * Payload 3.91.0:
 *
 *  - **Create** — the editing form, server-side, through `payload.db.create`
 *    (`@payloadcms/ui/dist/utilities/handleFormStateLocking.js`), which never consults access. No
 *    client code POSTs a lock. So: nobody creates over the API.
 *  - **Refresh** — the same path, `payload.db.updateOne`, own lock only. Needs no REST access.
 *  - **Read** — every lock lookup (the "Document locked" dialog, list-view lock icons) runs with the
 *    VIEWER's access. ⚑ Restricting read would silently remove the warning for real conflicts
 *    (decision 1), so read stays open to signed-in users.
 *  - **Take over** — the taking user PATCHes ANOTHER holder's row with `{ user: <themselves> }`
 *    (`providers/DocumentInfo/index.js`). So update is allowed only as exactly that: the `user` field
 *    alone, naming the caller, on a document the caller may edit. ⚑ Do not make update owner-only;
 *    that breaks Take over.
 *  - **Unlock on leave** — the holder DELETEs their own row (`views/Edit/index.js`, owner-checked
 *    client-side). So delete is own-lock-only.
 *
 * ⚑ "MAY EDIT" IS THE TARGET COLLECTION'S OWN `access.update`, evaluated for that one document. For
 * `lesson-bundle-versions` that is `versionUpdateGrantForFormRenderOnly` — the one documented reuse of
 * the form-render grant (see access/versionImmutability.ts): a lock is form-session state, which is
 * exactly what that grant describes, and it never authorizes a version write.
 *
 * Only the collections in {@link LOCKABLE_COLLECTIONS} keep locking (decision 2); every other
 * collection and the system-settings global set `lockDocuments: false`, so a lock can never block
 * their App actions. The unit spec pins the set against the built config.
 */
import type { Access, PayloadRequest, Where } from 'payload'

import { authenticated } from './index'

/** Payload's slug for the generated lock collection (installed `locked-documents/config.js`). */
export const LOCKED_DOCUMENTS_SLUG = 'payload-locked-documents'

/**
 * Where people edit in the built-in admin form, so Payload's warning and Take over exist (decision 2).
 * Everything else in `payload.config.ts` carries `lockDocuments: false`.
 */
export const LOCKABLE_COLLECTIONS = [
  'lesson-plans',
  'lesson-bundle-versions',
  'subjects',
  'subject-grades',
] as const

type LockableSlug = (typeof LOCKABLE_COLLECTIONS)[number]
type Ref = { relationTo?: string; value?: unknown } | number | string | null | undefined

const refId = (ref: Ref): unknown =>
  ref != null && typeof ref === 'object' ? ((ref.value as { id?: unknown })?.id ?? ref.value) : ref

const isLockable = (slug: unknown): slug is LockableSlug =>
  (LOCKABLE_COLLECTIONS as readonly unknown[]).includes(slug)

/** May `req.user` edit this one document, by the target collection's own `access.update`? */
export async function canEditLockTarget(
  req: PayloadRequest,
  relationTo: unknown,
  id: unknown,
): Promise<boolean> {
  if (!req.user || !isLockable(relationTo) || id == null) return false
  const update = req.payload.collections[relationTo]?.config.access.update
  if (!update) return false
  const grant = await update({ id: id as number, req })
  if (typeof grant === 'boolean') return grant
  const { totalDocs } = await req.payload.count({
    collection: relationTo,
    where: { and: [{ id: { equals: id } }, grant as Where] },
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

/** The stored lock row, read on the trusted path (the caller's own read access is not the question). */
const findLock = (req: PayloadRequest, id: number | string) =>
  req.payload
    .findByID({
      collection: LOCKED_DOCUMENTS_SLUG,
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    .catch(() => null) as Promise<{ document?: Ref; globalSlug?: string | null; user?: Ref } | null>

/** Nobody creates a lock over the API; the editing form creates them through `payload.db`. */
export const lockCreate: Access = () => false

/** Decision 1: every signed-in user, so Payload's own lock lookups keep finding real conflicts. */
export const lockRead: Access = authenticated

/**
 * Take over: by id only, the `user` field only, naming the caller, on a collection document the caller
 * may edit. Global locks have no Take over to support here (no lockable global is edited in the form).
 */
export const lockUpdate: Access = async ({ req, id, data }) => {
  if (!req.user || id == null || !data) return false
  const keys = Object.keys(data)
  if (keys.length !== 1 || keys[0] !== 'user') return false
  if (refId(data.user as Ref) !== req.user.id) return false
  const lock = await findLock(req, id)
  if (!lock?.document || typeof lock.document !== 'object') return false
  return canEditLockTarget(req, lock.document.relationTo, refId(lock.document))
}

/** Unlock on leave: the holder's own row only. A stale lock simply expires (five minutes). */
export const lockDelete: Access = ({ req: { user } }) =>
  user ? ({ 'user.value': { equals: user.id } } satisfies Where) : false
