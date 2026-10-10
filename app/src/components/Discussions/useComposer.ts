'use client'

/**
 * The submission half both composers share: the state machine (`lib/discussionComposer.ts`), the key that
 * travels with its content, and what to do with each outcome. The composer owns its fields; this owns
 * whether they may change.
 */
import { useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'

import {
  composerReducer,
  fieldsLocked,
  initialComposerState,
  type ComposerEvent,
  type ComposerState,
} from '@/lib/discussionComposer'
import { submitPost, type PostRequest } from './submitPost'

export function useComposer(authorId: number, onPosted?: () => void) {
  const router = useRouter()
  // The wrapper drops `composerReducer`'s optional third parameter (a key source for tests), which React's
  // reducer typing would otherwise read as a required action argument.
  const [state, dispatch] = useReducer(
    (s: ComposerState, e: ComposerEvent) => composerReducer(s, e),
    undefined,
    initialComposerState,
  )
  // The exact request last sent. "Try again" re-sends THIS — never the fields as they are now — so the
  // retried content is always the content the key was minted for.
  const lastSent = useRef<PostRequest | null>(null)

  const send = async (req: PostRequest) => {
    if (state.phase === 'sending') return
    lastSent.current = req
    dispatch({ type: 'submit' })
    const outcome = await submitPost(req, state.key, authorId)
    if (outcome.kind === 'posted') {
      dispatch({ type: 'posted' })
      lastSent.current = null
      onPosted?.()
      // `push` renders the destination afresh — except when only the #anchor differs (a reply landing on
      // the page it was written on), where the router just scrolls; only then is a refresh needed.
      const target = new URL(outcome.href, window.location.href)
      const hashOnly =
        target.pathname === window.location.pathname && target.search === window.location.search
      router.push(outcome.href)
      if (hashOnly) router.refresh()
      return
    }
    dispatch(
      outcome.kind === 'uncertain'
        ? { type: 'uncertain', message: outcome.message }
        : { type: 'refused', message: outcome.message },
    )
  }

  return {
    state,
    locked: fieldsLocked(state),
    /** Submit the fields as they are now (only possible while editing). */
    submit: send,
    /** After an uncertain result: the same request, under the same key. */
    retry: () => (lastSent.current ? send(lastSent.current) : undefined),
  }
}
