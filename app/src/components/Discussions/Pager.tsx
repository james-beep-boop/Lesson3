import React from 'react'
import Link from 'next/link'

/** Previous · Page N of M · Next — the topic list's and the thread's pagination. Nothing when one page. */
export default function Pager({
  page,
  totalPages,
  href,
  label,
}: {
  page: number
  totalPages: number
  href: (page: number) => string
  label: string
}) {
  if (totalPages <= 1) return null
  return (
    <nav className="disc-pager" aria-label={label}>
      {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages && <Link href={href(page + 1)}>Next</Link>}
    </nav>
  )
}
