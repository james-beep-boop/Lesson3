import React from 'react'

import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import TopicComposer from '@/components/Discussions/TopicComposer'
import { refLabelFor } from '@/lib/discussionText'
import { requireForum } from '@/lib/discussionPages'
import { findReadableVersion } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { requireUser } from '@/lib/session'

/**
 * Start a discussion. `?version=<id>` arrives from **Discuss this version** (lesson page) and **Post about
 * these changes** (after saving) and prefills the lesson reference — when the viewer can read it.
 *
 * ⚑ AN UNAVAILABLE PREFILL IS SAID, NOT SWALLOWED (GPT review 2026-10-10). If the version was deleted, or
 * is not readable, the composer opens without a reference AND says why: silently dropping it would leave
 * a teacher who clicked "Post about these changes" posting about nothing in particular.
 */
export default async function NewDiscussionPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>
}) {
  const { payload, user } = await requireUser()
  await requireForum(payload)
  const { version: versionParam } = await searchParams

  const asked = versionParam != null && versionParam !== ''
  const versionId = asked ? relId(versionParam) : null
  const version =
    versionId != null
      ? await findReadableVersion(payload, {
          id: versionId,
          user,
          select: { semver: true, title: true, meta: { substrand_name: true } },
        })
      : null
  const initialReference = version ? { versionId: version.id, label: refLabelFor(version) } : null

  return (
    <article className="disc">
      <PageHeader
        title="Start a discussion"
        actions={<PageBackLink href="/discuss" label="Back to discussions" />}
      />
      {asked && !version && (
        <p className="disc-notice" role="status">
          The lesson version you came from is no longer available, so this discussion has no lesson
          reference. You can add one below.
        </p>
      )}
      <TopicComposer authorId={user.id} initialReference={initialReference} />
    </article>
  )
}
