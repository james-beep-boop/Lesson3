'use client'

/**
 * The "Changes only" filter on the compare page — the whole of its interactivity.
 *
 * ⚑ IT TAKES `children`, NOT HTML PROPS. The area rows are server-rendered and passed through
 * untouched; this component only owns a boolean and puts a class on a wrapper. Handing it the
 * groups as props would serialize every area's HTML into the client payload and hydrate the longest
 * page in the app to operate one button. The hiding itself is CSS on `[data-changed='false']`
 * (styles.css), so toggling costs no re-render and keeps the scroll position.
 *
 * State is deliberately NOT persisted and NOT in the URL (decided 2026-08-23): filtered is the
 * useful default, sharing an unfiltered view has no demonstrated value, and a remembered preference
 * on a shared school computer would surprise the next teacher. `?view=all` can be added later
 * without breaking anything — it would then also have to be preserved by ComparePickers' links.
 */
import React, { useState } from 'react'

export default function CompareFilter({ children }: { children: React.ReactNode }) {
  const [changesOnly, setChangesOnly] = useState(true)

  return (
    <>
      <div className="compare-toolbar">
        <button
          type="button"
          className={`btn btn--compact btn--quiet${changesOnly ? ' is-active' : ''}`}
          aria-pressed={changesOnly}
          onClick={() => setChangesOnly((v) => !v)}
        >
          Changes only
        </button>
      </div>
      <div className={`compare-body${changesOnly ? ' compare-body--changes-only' : ''}`}>
        {children}
      </div>
    </>
  )
}
