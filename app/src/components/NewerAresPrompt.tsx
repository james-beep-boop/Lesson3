'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import Modal from './Modal'
import {
  editingAvailableAtWidth,
  EDITING_WIDER_SCREEN_BODY,
  EDITING_WIDER_SCREEN_TITLE,
} from '@/lib/editingViewport'

/** Dismissal lasts for this mounted page only; it creates no preference or draft. */
export default function NewerAresPrompt({
  ownId,
  ownSemver,
  officialId,
}: {
  ownId: number
  ownSemver: string
  officialId: number
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [tooNarrow, setTooNarrow] = useState(false)
  if (dismissed) return null
  // Combine opens the editor, so it explains itself below the editing width exactly as Edit does
  // (`EditActions`): checked at press time, never at render.
  const onCombine = () => {
    if (!editingAvailableAtWidth(window.innerWidth)) {
      setTooNarrow(true)
      return
    }
    router.push(`/admin/collections/lesson-bundle-versions/${ownId}?combineWith=${officialId}`)
  }
  return (
    <aside className="disc-notice lesson-release-notice" aria-label="Newer ARES release">
      <p>
        ARES has published a newer version of this lesson. Your version {ownSemver} is based on the
        older one.
      </p>
      <div className="lesson-release-notice__actions">
        <button type="button" className="btn" onClick={onCombine}>
          Combine them?
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setDismissed(true)}>
          Not now
        </button>
      </div>
      {tooNarrow && (
        <Modal
          title={EDITING_WIDER_SCREEN_TITLE}
          className="modal--plain"
          onClose={() => setTooNarrow(false)}
        >
          <p className="modal__body">{EDITING_WIDER_SCREEN_BODY}</p>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => setTooNarrow(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </aside>
  )
}
