'use client'

/**
 * Start a discussion (§16.1 labels; §16.4 "Duplicate submissions"). Plain text only. The text stays in the
 * form after any error and lives only in memory — never in browser storage (SPEC §13, shared computers).
 */
import React, { useState } from 'react'

import { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from '@/lib/discussionText'
import FormField from '@/components/FormField'
import { ComposerActions, PLAIN_TEXT_HINT } from './ComposerParts'
import ReferencePicker, { type ChosenReference } from './ReferencePicker'
import { useComposer } from './useComposer'

export default function TopicComposer({
  authorId,
  initialReference,
}: {
  authorId: number
  initialReference: ChosenReference | null
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reference, setReference] = useState(initialReference)
  const [referencePending, setReferencePending] = useState(false)
  const { state, locked, submit, retry } = useComposer(authorId)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (locked || referencePending || !title.trim() || !body.trim()) return
    void submit({
      kind: 'topic',
      data: {
        title: title.trim(),
        body: body.trim(),
        ...(reference ? { refVersion: reference.versionId } : {}),
      },
    })
  }

  return (
    <form className="disc-compose" onSubmit={onSubmit}>
      <FormField label="Title" hint="Name the lesson and the question or change.">
        {(ids) => (
          <input
            {...ids}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            required
            readOnly={locked}
          />
        )}
      </FormField>
      <FormField label="Post" hint={PLAIN_TEXT_HINT}>
        {(ids) => (
          <textarea
            {...ids}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={MAX_BODY_LENGTH}
            required
            readOnly={locked}
          />
        )}
      </FormField>
      <ReferencePicker
        value={reference}
        onChange={setReference}
        onPendingChange={setReferencePending}
        disabled={locked}
      />
      <ComposerActions
        phase={state.phase}
        message={state.message}
        submitLabel="Post"
        canSubmit={!referencePending && !!title.trim() && !!body.trim()}
        onRetry={retry}
      />
    </form>
  )
}
