/**
 * Forum test helpers shared by the discussions specs (int, http, e2e) — one shape for creating a topic,
 * one submission-key source, and one cleanup of the posting cap, instead of a copy per spec.
 */
import type { Payload } from 'payload'

import type { DiscussionTopic, User } from '../../src/payload-types'
import { clearRateLimitBuckets } from './db'
import { MARK } from './fixtures'

let keyCounter = 0

/** A fresh, valid `submissionKey` (16–64 of `[A-Za-z0-9-]`), unique within the run. */
export const testSubmissionKey = (): string => `${crypto.randomUUID()}-${++keyCounter}`

/** Post a topic AS `user`, through the collection's own access and hooks. */
export async function createTopicAs(
  payload: Payload,
  user: User,
  data: Record<string, unknown> = {},
): Promise<DiscussionTopic> {
  return (await payload.create({
    collection: 'discussion-topics',
    data: {
      title: `${MARK}Topic`,
      body: 'Opening post',
      submissionKey: testSubmissionKey(),
      ...data,
    } as never,
    overrideAccess: false,
    user,
  })) as DiscussionTopic
}

/** Clear the daily posting cap (`discussionPost`) for each of `users`, so a spec cannot starve the next. */
export async function clearPostingCaps(
  payload: Payload,
  users: ReadonlyArray<Pick<User, 'id'>>,
): Promise<void> {
  for (const user of users) await clearRateLimitBuckets(payload, `discussionPost:${user.id}`)
}
