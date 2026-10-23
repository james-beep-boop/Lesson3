import React from 'react'

import NewTabLink from './NewTabLink'

/**
 * The shared inspection step beside candidate-version deletion controls.
 *
 * Both callers live in Payload's admin root while the existing comparison page lives in the
 * frontend root, so this is a plain anchor rather than `next/link` (the hop is a full-document
 * navigation either way). It deliberately opens a new tab: the caller is deciding whether to delete
 * a candidate, and closing the comparison must return them to the unchanged Manage/editor context.
 */
export default function CompareToOfficialLink({
  planId,
  officialVersionId,
  candidateVersionId,
  className = 'btn',
}: {
  planId: number
  officialVersionId: number
  candidateVersionId: number
  className?: string
}) {
  return (
    <NewTabLink
      className={className}
      href={`/lessons/${planId}/compare?from=${officialVersionId}&to=${candidateVersionId}`}
      name="Compare to Official"
    />
  )
}
