import { sql } from '@payloadcms/db-postgres'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeLoginHook,
} from 'payload'
import { APIError, Forbidden } from 'payload'

import type { User } from '@/payload-types'
import type { Assignment } from '../access'
import { isSiteAdmin, isSubjectAdminFor, toId } from '../access'
import { AccountDisabledError } from '../errors/AccountDisabled'
import { lockRows, txDb } from '../lib/txDb'

const rowSignature = (a: Assignment): string => `${toId(a.subjectGrade)}:${a.role}`

/**
 * ⚑ THE ADVISORY-LOCK REGISTRY for this collection. Both keys share classifier `1280527187` and
 * differ in the second int, so they are visibly one family and cannot collide with the row-id
 * advisory locks unrelated features use.
 *
 *   (…, 1)  first-user bootstrap — `grantSiteAdminToFirstUser`
 *   (…, 2)  the ADMINISTRATOR-COUNT invariant — every operation that can reduce the number of
 *           usable Site Administrators: grant/demote (roles), delete, and disable.
 *
 * ⚑ ONE KEY ACROSS ALL FOUR OPERATIONS, not one per operation, and that is the whole point. The
 * invariant is an AGGREGATE ("at least one administrator remains"), so a per-operation or per-user
 * key would let a demotion and a disable of the two last administrators both observe a count of two
 * and both commit — leaving zero. A concurrent test that races demote-against-demote would pass
 * against that broken implementation, which is why the matrix races demote against DISABLE.
 *
 * ⚑ LOCK ORDER, AND IT IS UNIVERSAL: **this global key FIRST, then any per-user row lock.**
 *
 * That order is forced by the generic path and cannot be chosen freely. A plain `PATCH /api/users/:id`
 * or a `DELETE` runs its `beforeChange`/`beforeDelete` hooks — including this guard, which takes the
 * key — BEFORE Payload issues the DML that takes the row lock. So every generic write is
 * advisory-then-row, and nothing in the hook layer can reorder it.
 *
 * ⚑ THE CUSTOM ENDPOINTS THEREFORE HAVE TO MATCH, and the first version did not: it took the row
 * lock in `lockAndVerifyFresh` and only met this key later, inside the update. A same-user endpoint
 * request racing a generic PATCH then deadlocks — A holds the row and waits for the key, B holds the
 * key and waits for the row — which Postgres resolves by aborting one transaction. `takeAdminCountLock`
 * exists so the endpoints can acquire the key up front and join the one order.
 */
export const ADMIN_COUNT_LOCK = { classifier: 1280527187, key: 2 } as const

/**
 * Refuse sign-in for a disabled account (D13a step 2).
 *
 * ⚑ THIS HOOK HAS TWO CALLERS, and the second one is easy to miss: Payload runs `beforeLogin` in
 * the `login` operation AND inline inside `resetPassword` before it signs the token
 * (`auth/operations/resetPassword.js:113`, verified). So this also refuses to CONSUME a reset link
 * while disabled — which is the intended behaviour (D13a step 4), not a side effect: the password
 * change is rolled back and the user is told why.
 *
 * ⚑ `AccountDisabledError`, never a plain `Forbidden`. Both this refusal and Payload's own
 * invalid-token error are HTTP 403, so the client cannot separate them by status; the machine-
 * readable `data.code` is the only stable discriminator, and `Forbidden` carries no `data` at all.
 * See `errors/AccountDisabled.ts` and its contract spec.
 *
 * ⚑ NOT AN ORACLE. This fires only after Payload has matched credentials or validated a reset
 * token, so whoever sees it is the account's owner. A caller holding a bogus token still learns
 * nothing — the token check throws first.
 */
export const refuseDisabledLogin: CollectionBeforeLoginHook = ({ user }) => {
  if ((user as User | undefined)?.signInDisabled) throw new AccountDisabledError()
  return user
}

/**
 * Is this user a Site Administrator who can actually sign in?
 *
 * ⚑ "USABLE" IS THE WHOLE POINT, and it takes THREE conditions — the role is not enough, and
 * neither are two of them. An administrator who cannot sign in does not keep the installation
 * administrable, so counting them lets the last real administrator be demoted while they "cover" the
 * invariant, which is exactly the lockout this guard exists to prevent.
 *
 *   role            — obviously
 *   !signInDisabled — the gate this PR adds
 *   _verified       — ⚑ AND THIS ONE IS EASY TO MISS. Payload refuses an unverified account at BOTH
 *                     doors: the login op throws `UnverifiedEmail` (`auth/operations/login.js:184`)
 *                     and the JWT strategy resolves `user && (!auth.verify || user._verified)`,
 *                     returning no user otherwise (`auth/strategies/jwt.js:72`). An unverified Site
 *                     Admin therefore cannot administer anything.
 *
 * ⚑ AND IT IS REACHABLE, not theoretical: `grantSiteAdminToFirstUser` grants the role on the first
 * CREATE, and under open registration that account is unverified until someone clicks a link. A
 * fresh deployment thus has an unverified Site Admin by construction — precisely the "cover" that
 * would let the last verified one be demoted.
 */
const isUsableSiteAdmin = (
  u: Pick<User, 'roles' | 'signInDisabled' | '_verified'> | null | undefined,
): boolean => Boolean(u) && isSiteAdmin(u as User) && !u!.signInDisabled && Boolean(u!._verified)

/**
 * Refuse an operation that would remove the LAST usable Site Administrator.
 *
 * ⚑ CONCURRENCY-SAFE BY CONSTRUCTION, and a read-then-write hook is not. Under READ COMMITTED two
 * concurrent operations each observe a count of two and both commit, leaving zero — so the count
 * happens AFTER taking `ADMIN_COUNT_LOCK`, inside the caller's transaction, and the write follows in
 * that same transaction.
 *
 * ⚑ ONE KEY FOR EVERY COUNT-REDUCING OPERATION (demote, delete, disable). A per-operation key would
 * serialize demote-against-demote and still let demote race DISABLE to zero. See `ADMIN_COUNT_LOCK`.
 *
 * ⚑ A LOCK THAT HOLDS NOTHING MUST FAIL, not no-op — the discipline #221 established after a
 * pool-fallback lock left a race wide open with nothing to say so. `txDb(..., requireTransaction)`
 * refuses outside a transaction rather than silently proceeding unlocked.
 *
 * ⚑ `pg_advisory_xact_lock` is TRANSACTION-scoped: it releases at COMMIT/ROLLBACK, not when this
 * function returns. Hook ordering therefore shortens the hold only by the runtime of the hooks ahead
 * of it — the lock still spans the UPDATE, the afterChange hooks and the commit. That is fine here
 * (these writes happen a handful of times in an installation's life, so contention is nil), but do
 * not read the ordering as a hold-duration optimisation.
 */
/**
 * Take the shared administrator-count key on the caller's transaction.
 *
 * Exported so a custom endpoint can acquire it BEFORE its per-user row lock and thereby match the
 * order every generic write already uses (see `ADMIN_COUNT_LOCK`). Acquiring twice within one
 * transaction is harmless — `pg_advisory_xact_lock` is re-entrant and releases everything at commit
 * — so the guard below still takes it unconditionally and does not need to know whether an endpoint
 * got there first.
 */
export async function takeAdminCountLock(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
): Promise<void> {
  const db = await txDb(req, { requireTransaction: true })
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(${ADMIN_COUNT_LOCK.classifier}, ${ADMIN_COUNT_LOCK.key})`,
  )
}

async function assertAnotherUsableSiteAdminRemains(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  excludeUserId: number | string,
): Promise<void> {
  await takeAdminCountLock(req)
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    where: {
      and: [
        { roles: { contains: 'siteAdmin' } },
        { id: { not_equals: excludeUserId } },
        // ⚑ `not_equals: true` would be WRONG: in SQL `NULL != true` is NULL, so a row whose flag is
        // NULL (any account created before the column existed, had the migration not defaulted it)
        // would be silently excluded from the count — making the guard MORE likely to refuse, but
        // for an invisible reason. State both accepted shapes instead.
        { or: [{ signInDisabled: { equals: false } }, { signInDisabled: { exists: false } }] },
        // ⚑ `equals: true`, not "not false". An unverified administrator cannot authenticate at all
        // (see `isUsableSiteAdmin`), so counting one as cover is the lockout this guard prevents.
        { _verified: { equals: true } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (totalDocs === 0) {
    // One sentence for one invariant. It was briefly a parameter, with both call sites passing the
    // identical string — a variation point with no variation, duplicated across two files.
    throw new APIError(
      'This is the last site administrator who can sign in — grant the role to someone else first.',
      403,
    )
  }
}

/**
 * The last-Site-Admin and self-action guards for UPDATES — demotion and disabling (D13a steps 5–6).
 *
 * Deletion is guarded separately in `guardLastSiteAdminOnDelete` because it is a different hook.
 *
 * ⚑ THIS FIRES ON THE ENDPOINT'S TRUSTED WRITE TOO. `overrideAccess: true` bypasses ACCESS control,
 * not hooks — which is exactly why the disable endpoint is allowed to be the sole writer of a field
 * whose `update` access is `() => false` and still be guarded here.
 */
export const guardLastSiteAdmin: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !originalDoc || !data) return data
  const before = originalDoc as User
  const actor = (req.user as User) ?? null

  // Would this write leave the target a usable administrator? `data` carries only changed keys, so
  // fall back to the current value for anything absent.
  const nextRoles = 'roles' in data ? (data.roles as User['roles']) : before.roles
  const nextDisabled =
    'signInDisabled' in data ? Boolean(data.signInDisabled) : Boolean(before.signInDisabled)
  // ⚑ `_verified` is a usability axis too, so UNVERIFYING the last usable administrator is a
  // count-reducing change and is guarded exactly like a demotion. `_verified` is Site-Admin-writable
  // (it is the manual-verify repair action), so this is a real path, not a hypothetical one.
  const nextVerified = '_verified' in data ? Boolean(data._verified) : Boolean(before._verified)
  const wasUsable = isUsableSiteAdmin(before)
  const willBeUsable = isUsableSiteAdmin({
    roles: nextRoles,
    signInDisabled: nextDisabled,
    _verified: nextVerified,
  })

  // Self-disable guard: an administrator locking themselves out is always a mistake, and it is the
  // one case where the last-admin count would NOT catch it (another admin may well remain).
  if (
    actor &&
    String(actor.id) === String(before.id) &&
    !Boolean(before.signInDisabled) &&
    nextDisabled
  ) {
    throw new APIError('You cannot disable your own sign-in — ask another administrator.', 403)
  }

  if (wasUsable && !willBeUsable) {
    await assertAnotherUsableSiteAdminRemains(req, before.id)
  } else if (!wasUsable && willBeUsable) {
    /**
     * A GRANT — this write ADDS a usable administrator. It cannot break the invariant, so there is
     * nothing to assert, but it still takes the shared key.
     *
     * ⚑ WHY, given it is provably safe on its own: the design fixes ONE key across grant, demote,
     * delete and disable, and a grant that skips it is not merely a documentation gap. Without it, a
     * grant and a concurrent demote are serialised only by chance — the demote's COUNT either sees
     * the grant's committed row or does not, and when it does not it refuses a demotion that would
     * in fact have been safe. That is fail-CLOSED, so nothing is lost but an administrator gets a
     * confusing refusal they cannot act on. Joining the key removes the coin flip.
     *
     * It is also what makes the rule stated on `ADMIN_COUNT_LOCK` literally true, rather than true
     * of three operations out of the four it names.
     */
    await takeAdminCountLock(req)
  }
  return data
}

/** The same invariant on the delete path, plus the self-delete guard (D13). */
export const guardLastSiteAdminOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const actor = (req.user as User) ?? null
  if (actor && String(actor.id) === String(id)) {
    throw new APIError('You cannot delete your own account.', 403)
  }
  // Projected to the two fields the predicate reads: a full hydrate would pull the `assignments` and
  // `sessions` array tables and run afterRead hooks, on every user delete, to answer a boolean.
  const target = (await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    select: { roles: true, signInDisabled: true, _verified: true },
    overrideAccess: true,
    req,
  })) as User
  if (!isUsableSiteAdmin(target)) return
  await assertAnotherUsableSiteAdminRemains(req, id)
}

/**
 * Bootstrap: make the very first user a Site Administrator (SPEC §8).
 *
 * `access.admin` (adminPanelAccess) admits only site admins / assigned users, and
 * `roles` defaults to []. Without this, the first user created on a fresh deployment
 * would be locked out of the admin panel — a bootstrap deadlock. On the first create
 * (no users yet) we force `roles` to include 'siteAdmin'.
 */
export const grantSiteAdminToFirstUser: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data) return data

  // Two simultaneous first-register requests can both observe zero users under READ COMMITTED.
  // Serialize that count-and-grant decision on the request transaction so only the actual first
  // committed user receives Site Admin. A fixed two-int advisory key is app-local and avoids
  // colliding with row-id advisory locks used by unrelated features.
  const db = await txDb(req, { requireTransaction: true })
  await db.execute(sql`SELECT pg_advisory_xact_lock(1280527187, 1)`)
  const { totalDocs } = await req.payload.count({ collection: 'users', req })
  if (totalDocs === 0) {
    data.roles = [...new Set([...(data.roles ?? []), 'siteAdmin' as const])]
  }
  return data
}

/**
 * Guard password changes (SPEC §8 / least privilege).
 *
 * Subject Admins hold collection-level update on every user (so `enforceAssignmentScope`
 * can validate assignment edits). But Payload's update pipeline saves `data.password`
 * outside normal field access (verified in installed source: `collections/operations/
 * utilities/update.js` saves it with no password-specific check), so without this guard a
 * Subject Admin could reset *any* user's password → account takeover. Only the user
 * themselves or a Site Admin may change a password here.
 *
 * Safe against the legitimate flows: the token reset (`auth/operations/resetPassword.js`)
 * writes hash/salt directly via `payload.db.updateOne` and never puts `password` in hook
 * data; trusted system calls run with `overrideAccess` and no `req.user` (and an
 * unauthenticated REST update is already denied at collection access, so it never reaches
 * here) — hence `!actor` is treated as a trusted system operation.
 */
export const guardPasswordChange: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || !data?.password) return data
  const actor = (req.user as User) ?? null
  if (!actor || isSiteAdmin(actor) || actor.id === originalDoc?.id) return data
  throw new Forbidden(req.t)
}

/**
 * Scope assignment edits for non-site-admin actors (SPEC §8).
 *
 * A Subject Admin may manage roles only within the subject-grades they administer.
 * Field access already gates *whether* assignments may be touched; this hook gates
 * *which* rows. We diff incoming vs existing assignments and require the actor to be
 * Subject Admin for every subject-grade whose row was added, removed, or changed.
 * Site Admins are unrestricted.
 *
 * Additionally (Codex round-3 #2): a SITE ADMIN's assignment rows may be changed only by Site
 * Admins. `roles` is field-HIDDEN from Subject Admins, so a client cannot even reliably know the
 * target is one — the server owns this rule for every write path (assignment endpoints, generic
 * PATCH, the native admin form). Applied only when rows actually change, so an incidental
 * unchanged-array resubmit stays a no-op.
 */
export const enforceAssignmentScope: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const actor = (req.user as User) ?? null
  if (!actor || isSiteAdmin(actor)) return data
  if (!data || !('assignments' in data)) return data

  const before: Assignment[] = originalDoc?.assignments ?? []
  const after: Assignment[] = data.assignments ?? []
  const beforeSigs = new Set(before.map(rowSignature))
  const afterSigs = new Set(after.map(rowSignature))

  const touchedSubjectGradeIds = new Set<number | undefined>()
  for (const a of after) if (!beforeSigs.has(rowSignature(a))) touchedSubjectGradeIds.add(toId(a.subjectGrade))
  for (const b of before) if (!afterSigs.has(rowSignature(b))) touchedSubjectGradeIds.add(toId(b.subjectGrade))

  if (touchedSubjectGradeIds.size > 0 && (originalDoc as User | undefined)?.roles?.includes('siteAdmin')) {
    throw new Forbidden(req.t)
  }

  for (const sgId of touchedSubjectGradeIds) {
    if (!isSubjectAdminFor(actor, sgId)) {
      throw new Forbidden(req.t)
    }
  }
  return data
}

/**
 * Enforce "≤1 Subject Admin per subject-grade" (SPEC §8): when a user is granted
 * Subject Admin for a subject-grade, demote any *other* holder of that grant to
 * editing access — in the same transaction (`req` threaded) and guarded by a context flag
 * so the cascading update doesn't re-trigger this hook.
 */
export const autoDemotePriorSubjectAdmins: CollectionAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  if (context?.skipAutoDemote) return doc

  const grantedSubjectGradeIds = [
    ...new Set<number>(
      (doc.assignments ?? [])
        .filter((a: Assignment) => a.role === 'subjectAdmin')
        .map((a: Assignment) => toId(a.subjectGrade))
        .filter((id: number | undefined): id is number => id != null),
    ),
  ]

  if (grantedSubjectGradeIds.length === 0) return doc

  // Serialize concurrent grants for the same subject-grade (Codex 2026-07-05 #3 / Bucket A #10,
  // Phase 5 A2): two transactions granting DIFFERENT users the same grade each run the scan below
  // before the other commits — under READ COMMITTED neither sees the other's uncommitted grant, so
  // neither demotes and both commit: two Subject Admins. Row-locking the granted subject_grades
  // rows first makes the second transaction block HERE until the first commits; its scan then sees
  // the committed grant and demotes it.
  //
  // `lockRows` owns the mechanics — ascending order so a save granting multiple grades cannot
  // deadlock a concurrent one, and a REFUSAL rather than a pool fallback when no transaction is
  // active. This comment used to claim the no-transaction case was "a harmless no-op": it is a
  // no-op, and it was never harmless, since a lock that holds nothing leaves the race above wide
  // open with nothing to say so.
  await lockRows(req, 'subject_grades', grantedSubjectGradeIds)

  for (const sgId of grantedSubjectGradeIds) {
    // depth: 0 → assignment.subjectGrade comes back as raw IDs (no normalization needed).
    // Paginate the full holder set — the old single find silently capped the demote scan at
    // 1000 users. Post-lock we are the only writer for this grade, so collecting every page
    // before demoting is race-free.
    const holders: User[] = []
    let page = 1
    for (;;) {
      const res = await req.payload.find({
        collection: 'users',
        depth: 0,
        limit: 200,
        page,
        sort: 'id',
        where: {
          and: [{ id: { not_equals: doc.id } }, { 'assignments.subjectGrade': { equals: sgId } }],
        },
        req,
      })
      holders.push(...res.docs)
      if (!res.hasNextPage) break
      page += 1
    }

    for (const other of holders) {
      let changed = false
      const assignments = (other.assignments ?? []).map((a) => {
        if (toId(a.subjectGrade) === sgId && a.role === 'subjectAdmin') {
          changed = true
          return { ...a, role: 'editor' as const }
        }
        return a
      })
      if (changed) {
        await req.payload.update({
          collection: 'users',
          id: other.id,
          data: { assignments },
          req,
          overrideAccess: true, // system invariant; the triggering change was already authorized
          context: { skipAutoDemote: true },
        })
      }
    }
  }
  return doc
}
