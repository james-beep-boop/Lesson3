/**
 * POST /api/lesson-plans/:id/request-editing (teacher-first T3, DECISIONS 2026-07-08 §6).
 *
 * A viewer asks for Editor access to this plan's subject-grade. The server composes a standard
 * internal message to the subject-grade's Subject Admin plus every Site Admin — the roster is
 * deliberately names-only (SPEC §8), so a teacher CANNOT know who the admins are; resolving the
 * recipients is this endpoint's one privileged step. The messages themselves are created AS THE
 * CALLER with `overrideAccess: false`, so sender stamping, the per-sender daily message cap,
 * context-link validation, and the notification ping all run exactly as for a hand-written
 * message. The grant itself stays manual (Manage → Editors widget).
 *
 * Throttle: ONE request per user per subject-grade per day (`editRequest` bucket, keyed
 * `${userId}:${sgId}`) — checked BEFORE any work, same probing-spends-budget posture as email.
 */
import { APIError, commitTransaction, initTransaction, killTransaction, type Endpoint, type PayloadRequest } from 'payload'

import { json } from './respond'
import { toId, isEditorFor } from '../access'
import { findReadablePlan } from '../lib/readBundle'
import { enforceSharedRateLimit } from '../lib/rateLimit'
import type { SubjectGrade, User } from '../payload-types'

/**
 * The users to notify: every Site Admin + the subject-grade's Subject Admin (≤1 by invariant),
 * deduped, excluding the requester. Runs with overrideAccess (system lookup — the results are
 * never returned to the caller, only messaged). Both sets are naturally tiny; the grant-holder
 * query mirrors the demote scan's shape (userRoles.ts), filtered in-memory for the admin role
 * because two dot-path conditions can't be pinned to the SAME array element.
 */
async function resolveRecipients(req: PayloadRequest, sgId: number, requesterId: number | string): Promise<User[]> {
  const [siteAdmins, holders] = await Promise.all([
    req.payload.find({
      collection: 'users',
      where: { roles: { contains: 'siteAdmin' } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'users',
      where: { 'assignments.subjectGrade': { equals: sgId } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ])
  const subjectAdmins = holders.docs.filter((u) =>
    (u.assignments ?? []).some((a) => toId(a.subjectGrade as never) === sgId && a.role === 'subjectAdmin'),
  )
  const byId = new Map<number | string, User>()
  for (const u of [...siteAdmins.docs, ...subjectAdmins]) {
    if (String(u.id) !== String(requesterId)) byId.set(u.id, u)
  }
  return [...byId.values()]
}

export const requestEditingEndpoint: Endpoint = {
  path: '/:id/request-editing',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const user = req.user as User

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing lesson plan id', 400)
    const plan = await findReadablePlan(req.payload, { id, user, req })
    if (!plan) throw new APIError('Lesson plan not found', 404)

    const sgId = toId(plan.subjectGrade as never)
    if (sgId == null) throw new APIError('Lesson plan has no subject-grade', 409)
    if (isEditorFor(user, sgId)) {
      throw new APIError('You already have editing access for this subject.', 409)
    }

    const limited = await enforceSharedRateLimit(
      req,
      'editRequest',
      `${user.id}:${sgId}`,
      'You already requested editing access for this subject recently — an administrator will be in touch.',
    )
    if (limited) return limited

    // Subject + grade for the message body (the sender line already attributes the requester).
    const sg = (await req.payload.findByID({
      collection: 'subject-grades',
      id: sgId,
      depth: 1,
      overrideAccess: true,
      req,
    })) as SubjectGrade
    const subjectName =
      typeof sg.subject === 'object' && sg.subject ? sg.subject.name : 'this subject'
    const scopeLabel = `${subjectName} · Grade ${sg.grade}`

    const recipients = await resolveRecipients(req, sgId, user.id)
    if (recipients.length === 0) {
      // Practically unreachable (a Site Admin always exists) — but never fail silently.
      throw new APIError('No administrator is available to receive the request.', 503)
    }

    const body =
      `Please grant me editing access for ${scopeLabel}. ` +
      `(Sent from the lesson page — grant via Manage → Editors.)`

    // One message per recipient, all-or-nothing: a mid-loop failure (e.g. the sender's daily
    // message cap) must not leave a half-notified admin set.
    const shouldCommit = await initTransaction(req)
    try {
      for (const r of recipients) {
        await req.payload.create({
          collection: 'messages',
          data: { recipient: r.id, body, lessonPlan: plan.id } as never,
          overrideAccess: false,
          user,
          req,
        })
      }
      if (shouldCommit) await commitTransaction(req)
    } catch (e) {
      await killTransaction(req)
      throw e
    }

    return json({ sent: recipients.length })
  },
}
