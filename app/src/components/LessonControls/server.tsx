import React from 'react'
import type { BeforeDocumentControlsServerProps } from 'payload'

import { hasUnsavedWork } from '../../lib/editRecovery/kernel'
import { systemFlagsForRender } from '../../lib/systemFlags'
import { findReadableVersion, findReadableVersions } from '../../lib/readBundle'
import { relId } from '../../lib/relId'
import type { User } from '../../payload-types'
import LessonControls from './index'

/**
 * The version edit view's controls, registered as `beforeDocumentControls`: a server wrapper so
 * `LessonControls` (a client component) receives what it cannot read itself — the system flags (ALL
 * of them, so the next flag a control needs is a prop read, not another wrapper) and whether the
 * signed-in user already has a draft on this version, which turns Edit into "Continue editing"
 * (SPEC §5, 2026-10-17). Everything else `LessonControls` still takes from Payload's hooks.
 */
export default async function LessonControlsServer({
  payload,
  id,
  user,
}: BeforeDocumentControlsServerProps) {
  const versionId = Number(id)
  const [flags, hasDraft] = await Promise.all([
    systemFlagsForRender(payload),
    // Existence only, keyed on the session user. A version that cannot be edited never shows the
    // button, so no access check is needed for a boolean that only changes its label.
    user && Number.isInteger(versionId)
      ? hasUnsavedWork(
          { payload, transactionID: undefined },
          { userId: Number(user.id), sourceVersionId: versionId },
        )
      : false,
  ])
  const source =
    user && Number.isInteger(versionId)
      ? await findReadableVersion(payload, {
          id: versionId,
          user: user as User,
          select: { lessonPlan: true },
        })
      : null
  const planId = relId(source?.lessonPlan)
  const versions =
    user && planId !== null
      ? (await findReadableVersions(payload, { planId, user: user as User })).map(
          ({ id, semver }) => ({ id, semver }),
        )
      : []
  return <LessonControls flags={flags} hasDraft={hasDraft} versions={versions} />
}
