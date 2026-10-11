'use client'

/**
 * The reply box at the foot of a thread page.
 *
 * `joinedAtSeq` is the thread's `lastSeq` AS THIS PAGE WAS RENDERED (§16.4 "Where unread tracking
 * starts"): if this is your first post here, every reply that existed when you opened the page stays out
 * of your notifications, and one that arrived while you were typing stays unread. On success the box
 * clears, takes a fresh key, and the page moves to your reply — which, on a long thread, may be a later
 * page than this one.
 */
import React, { useState } from 'react'

import { MAX_BODY_LENGTH } from '@/lib/discussionText'
import ReferencePicker, { type ChosenReference } from './ReferencePicker'
import FormField from '@/components/FormField'
import { ComposerActions, PLAIN_TEXT_HINT } from './ComposerParts'
import { useComposer } from './useComposer'

export default function ReplyComposer({
  authorId,
  topicId,
  joinedAtSeq,
}: {
  authorId: number
  topicId: number
  joinedAtSeq: number
}) {
  const [body, setBody] = useState('')
  const [reference, setReference] = useState<ChosenReference | null>(null)
  const { state, locked, submit, retry } = useComposer(authorId, () => {
    setBody('')
    setReference(null)
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (locked || !body.trim()) return
    void submit({
      kind: 'reply',
      topicId,
      data: {
        body: body.trim(),
        joinedAtSeq,
        ...(reference ? { refVersion: reference.versionId } : {}),
      },
    })
  }

  return (
    <form className="disc-compose" onSubmit={onSubmit} aria-label="Write a reply">
      <FormField label="Reply" hint={PLAIN_TEXT_HINT}>
        {(ids) => (
          <textarea
            {...ids}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={MAX_BODY_LENGTH}
            required
            readOnly={locked}
          />
        )}
      </FormField>
      <ReferencePicker value={reference} onChange={setReference} disabled={locked} />
      <ComposerActions
        phase={state.phase}
        message={state.message}
        submitLabel="Post reply"
        canSubmit={!!body.trim()}
        onRetry={retry}
      />
    </form>
  )
}
