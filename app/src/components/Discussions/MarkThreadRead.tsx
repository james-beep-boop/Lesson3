'use client'

/**
 * Marks the replies this thread page displayed as read (§16.4 "Mark-read"), after render — a POST, never
 * a write during the GET, following `messages/MarkShownRead`. The range is exactly what the page showed
 * (`markRangeFor`), and the server only advances over a range that follows on from the marker, so
 * opening a later page directly marks nothing that was skipped.
 *
 * Fire-and-forget, no refresh: the "new" markers stay visible for this visit and the nav dot catches up
 * on the next navigation (no live updates, §16.1). A failure leaves the replies unread; the next visit
 * retries.
 */
import { useEffect } from 'react'

export default function MarkThreadRead({
  topicId,
  fromSeq,
  throughSeq,
}: {
  topicId: number
  fromSeq: number
  throughSeq: number
}) {
  // A StrictMode remount fires it twice in development; harmless, since the marker only moves forward.
  useEffect(() => {
    void fetch(`/api/discussion-topics/${topicId}/mark-read`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromSeq, throughSeq }),
    }).catch(() => {})
  }, [topicId, fromSeq, throughSeq])
  return null
}
