import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { versionReferenceLabel } from '../lib/lessonReference'
import { findReadableVersion, nullOnNotVisible } from '../lib/readBundle'
import { relId } from '../lib/relId'
import type { User } from '../payload-types'

/**
 * Labels are server-written only. `replyTo` is transient: only the original recipient can use it,
 * and the server copies the original context and chooses its sender as the reply recipient.
 * Operational failures propagate; only genuine missing/inaccessible records become refusals.
 */
export const validateContextLink: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  let context: Record<string, unknown> & { versionLabel: string | null } = {
    ...data,
    versionLabel: null,
  }
  const replying = data?.replyTo != null

  if (replying) {
    if (!req.user) throw new APIError('Sign in to reply to a message.', 403)
    const id = relId(data.replyTo)
    if (id == null) throw new APIError('The message you are replying to is not available.', 404)
    const original = await req.payload
      .findByID({
        collection: 'messages',
        id,
        user: req.user as User,
        overrideAccess: false,
        req,
        depth: 0,
        select: {
          sender: true,
          recipient: true,
          lessonPlan: true,
          version: true,
          versionLabel: true,
        },
      })
      .catch(nullOnNotVisible)
    if (!original) throw new APIError('The message you are replying to is not available.', 404)
    if (relId(original.recipient) !== req.user.id) {
      throw new APIError('You can only reply to a message you received.', 403)
    }
    context = {
      ...context,
      recipient: relId(original.sender),
      lessonPlan: relId(original.lessonPlan),
      version: relId(original.version),
      versionLabel: original.versionLabel ?? null,
    }
  }

  if (context.version == null) return context
  if (context.lessonPlan == null) {
    throw new APIError('A linked lesson version must include its lesson plan.', 400)
  }
  const select = {
    lessonPlan: true,
    title: true,
    semver: true,
    meta: { substrand_name: true },
  } as const
  // Trusted Local-API creates have no user, but still derive their label from the real version.
  const version = req.user
    ? await findReadableVersion(req.payload, {
        id: context.version as number | string,
        user: req.user as User,
        req,
        select,
      })
    : await req.payload.findByID({
        collection: 'lesson-bundle-versions',
        id: context.version as number | string,
        overrideAccess: true,
        req,
        depth: 0,
        select,
      })
  if (!version) {
    // The source message proved which reference was intended. Deletion or lost read access during
    // a reply must not turn it into a whole-lesson link; the inherited snapshot stays authoritative.
    if (replying)
      return { ...context, version: null, versionLabel: context.versionLabel ?? 'A lesson version' }
    throw new APIError('A linked lesson version must belong to the linked lesson plan.', 400)
  }
  if (req.user && relId(version.lessonPlan) !== relId(context.lessonPlan)) {
    throw new APIError('A linked lesson version must belong to the linked lesson plan.', 400)
  }
  return { ...context, versionLabel: context.versionLabel ?? versionReferenceLabel(version) }
}
