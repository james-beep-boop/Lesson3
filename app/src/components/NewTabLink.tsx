import React from 'react'

/**
 * A link that opens in a new tab, in the app's one convention: `↗` for the eye, ", opens in a new tab"
 * for a screen reader, and no handle back to this page (`noopener noreferrer`).
 *
 * The ` ` keeps a space before the arrow: these links are often `inline-flex` (buttons, and the
 * phone-sized lesson references), which trims a plain one.
 */
export default function NewTabLink({
  href,
  name,
  className,
  children,
}: {
  href: string
  /** The link's visible name; the accessible name adds ", opens in a new tab". */
  name: string
  className?: string
  /** Defaults to `name`. */
  children?: React.ReactNode
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name}, opens in a new tab`}
    >
      {children ?? name}
      {' '}
      <span aria-hidden="true">↗</span>
    </a>
  )
}
