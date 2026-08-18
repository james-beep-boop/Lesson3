/**
 * The lazy Users-panel directory (D11).
 *
 * The public collection route is intentionally not used for this screen: the panel needs one
 * computed type filter spanning `users_roles` and `users_assignments`, plus a deliberately small
 * response shape. The SQL below selects only ids and a count; every document returned to the
 * caller is then read through Payload with `overrideAccess: false`. That second read is the policy
 * boundary — the query is an index, not an alternate document API.
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { toId, userTypeLabel } from '../access'
import type { SubjectGrade, User } from '../payload-types'
import { distinctIds } from '../lib/relId'
import { rowsOf, txDb } from '../lib/txDb'
import {
  USER_SEARCH_TYPES,
  type UserSearchDocument,
  type UserSearchGrant,
  type UserSearchResponse,
  type UserSearchType,
} from '../lib/userSearchContract'
import { assertSiteAdmin, json } from './respond'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_QUERY_LENGTH = 120

function positiveInteger(raw: string | null, fallback: number, name: string): number {
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new APIError(`${name} must be a positive integer.`, 400)
  }
  return value
}

function typeFrom(raw: string | null): UserSearchType | null {
  if (raw === null || raw === '') return null
  if ((USER_SEARCH_TYPES as readonly string[]).includes(raw)) return raw as UserSearchType
  throw new APIError('type must be siteAdmin, subjectAdmin, or teacher.', 400)
}

function typeCondition(type: UserSearchType | null) {
  const siteAdmin = sql`EXISTS (
    SELECT 1 FROM users_roles ur
    WHERE ur.parent_id = u.id AND ur.value = 'siteAdmin'
  )`
  const subjectAdmin = sql`EXISTS (
    SELECT 1 FROM users_assignments ua
    WHERE ua._parent_id = u.id AND ua.role = 'subjectAdmin'
  )`

  if (type === 'siteAdmin') return siteAdmin
  if (type === 'subjectAdmin') return sql`NOT (${siteAdmin}) AND (${subjectAdmin})`
  if (type === 'teacher') return sql`NOT (${siteAdmin}) AND NOT (${subjectAdmin})`
  return sql`TRUE`
}

function idFrom(value: unknown): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`user search returned an invalid ${field}`)
  }
  return parsed
}

function grantRows(
  user: Pick<User, 'assignments'>,
  labels: ReadonlyMap<number, string>,
): UserSearchGrant[] {
  return (user.assignments ?? []).flatMap((assignment) => {
    const subjectGradeId = toId(assignment.subjectGrade)
    if (subjectGradeId == null) return []
    return [
      {
        role: assignment.role,
        subjectGradeId,
        // ⚑ ONE fallback for a label this endpoint could not resolve. The label map used to store
        // `displayName ?? ''` and this line then supplied `Subject grade N` for a MISSING id only, so
        // a present-but-unnamed subject-grade rendered as a bare separator on the very same list.
        subjectGradeLabel: labels.get(subjectGradeId) || `Subject grade ${subjectGradeId}`,
      },
    ]
  })
}

export const userSearchEndpoint: Endpoint = {
  path: '/search',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)

    const params = new URL(req.url ?? '', 'http://localhost').searchParams
    const q = (params.get('q') ?? '').trim()
    if (q.length > MAX_QUERY_LENGTH) {
      throw new APIError(`q must be ${MAX_QUERY_LENGTH} characters or fewer.`, 400)
    }
    const type = typeFrom(params.get('type'))
    const page = positiveInteger(params.get('page'), 1, 'page')
    const requestedLimit = positiveInteger(params.get('limit'), DEFAULT_LIMIT, 'limit')
    if (requestedLimit > MAX_LIMIT) {
      throw new APIError(`limit must be ${MAX_LIMIT} or fewer.`, 400)
    }

    const condition = typeCondition(type)
    const pattern = `%${q}%`
    const search = q ? sql`AND (u.name ILIKE ${pattern} OR u.email ILIKE ${pattern})` : sql``
    const db = await txDb(req)
    const totalDocs = nonNegativeInteger(
      rowsOf(
        await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users u
          WHERE ${condition} ${search}
        `),
      )[0]?.count ?? 0,
      'total count',
    )
    const totalPages = Math.ceil(totalDocs / requestedLimit)
    const offset = (page - 1) * requestedLimit

    // ⚑ ONE envelope, built once. The empty-page and populated returns were two literals, and they
    // had already drifted: the empty one hard-coded `hasNextPage: false` while the other computed it.
    // The two agree for every input reachable today, which is precisely why nothing failed.
    const envelope = (docs: UserSearchDocument[]): Response =>
      json({
        docs,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1 && totalDocs > 0,
        limit: requestedLimit,
        page,
        totalDocs,
        totalPages,
      } satisfies UserSearchResponse)
    const idResult = await db.execute(sql`
      SELECT
        u.id,
        (SELECT COUNT(*)::int
          FROM lesson_bundle_versions version
          WHERE version.author_id = u.id) AS authored_versions,
        (SELECT COUNT(*)::int
          FROM lesson_bundle_versions version
          JOIN lesson_plans plan ON plan.official_version_id = version.id
          WHERE version.author_id = u.id) AS official_versions
      FROM users u
      WHERE ${condition} ${search}
      ORDER BY LOWER(u.name), u.id
      LIMIT ${requestedLimit} OFFSET ${offset}
    `)
    // One pass over the rows, not two. `ids` and the counts map were built from separate traversals
    // that each re-derived and re-validated the id, so the page order and the counts were two
    // independent readings of one result set.
    const counted = rowsOf(idResult).flatMap((row) => {
      const id = idFrom(row.id)
      if (id === null) return []
      return [
        {
          id,
          authoredVersions: nonNegativeInteger(row.authored_versions, 'authored-version count'),
          officialVersions: nonNegativeInteger(row.official_versions, 'Official-version count'),
        },
      ]
    })
    const ids = counted.map((row) => row.id)

    if (ids.length === 0) return envelope([])

    // This is the access-controlled document read. Keep the explicit false: omitting it would rely
    // on a Local-API default that has changed across Payload releases, while `true` would turn the
    // SQL id projection above into an accidental privileged directory.
    const users = await req.payload.find({
      collection: 'users',
      depth: 0,
      pagination: false,
      where: { id: { in: ids } },
      select: {
        name: true,
        email: true,
        roles: true,
        assignments: true,
        signInDisabled: true,
        _verified: true,
        updatedAt: true,
      },
      overrideAccess: false,
      user: req.user,
      req,
    })

    const subjectGradeIds = distinctIds(
      users.docs.flatMap((user) =>
        (user.assignments ?? []).map((assignment) => toId(assignment.subjectGrade) ?? null),
      ),
    )
    const subjectGrades = subjectGradeIds.length
      ? await req.payload.find({
          collection: 'subject-grades',
          depth: 0,
          pagination: false,
          where: { id: { in: subjectGradeIds } },
          select: { displayName: true },
          overrideAccess: false,
          user: req.user,
          req,
        })
      : { docs: [] as SubjectGrade[] }
    const labels = new Map(
      subjectGrades.docs.flatMap((subjectGrade) =>
        subjectGrade.displayName ? [[subjectGrade.id, subjectGrade.displayName] as const] : [],
      ),
    )
    const byId = new Map(users.docs.map((user) => [user.id, user]))
    const docs = counted.flatMap(({ id, ...counts }): UserSearchDocument[] => {
      const user = byId.get(id)
      if (!user) return []
      return [
        {
          ...counts,
          id: user.id,
          name: user.name,
          email: user.email,
          // The projection carries every field the presentation-only helper reads (`roles` and
          // `assignments`); the generated SelectFromCollectionSlug type intentionally omits
          // unrelated required fields such as `createdAt`.
          type: userTypeLabel(user as User),
          verified: user._verified === true,
          signInDisabled: user.signInDisabled === true,
          siteAdmin: Boolean(user.roles?.includes('siteAdmin')),
          grants: grantRows(user, labels),
          updatedAt: String(user.updatedAt),
        },
      ]
    })

    return envelope(docs)
  },
}
