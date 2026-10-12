import React from 'react'

import { linkify, paragraphsOf } from '@/lib/discussionText'
export { default as PostReference } from '../LessonReference'

/**
 * A post's text: plain paragraphs (`\n` separates them) with http(s) URLs as links (§16.4 "Links in text").
 * Every piece renders as a React text node or an `<a>` — never as HTML — so nothing a teacher types can
 * become markup. Links open in a new tab, without a referrer or a handle back to this page.
 */
export function PostText({ text }: { text: string }) {
  return (
    <div className="disc-post__text">
      {paragraphsOf(text).map((line, i) => (
        <p key={i}>
          {linkify(line).map((seg, j) =>
            seg.kind === 'link' ? (
              <a key={j} href={seg.href} target="_blank" rel="noopener noreferrer">
                {seg.text}
              </a>
            ) : (
              <React.Fragment key={j}>{seg.text}</React.Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  )
}

/** "3 Oct 2026, 14:05" — the Messages format, so the two surfaces read alike. */
export const postTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
