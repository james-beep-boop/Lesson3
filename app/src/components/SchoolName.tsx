import React from 'react'

/** Server-rendered text, including the avatar menu slot. No HTML interpretation or placeholder. */
export default function SchoolName({
  name,
  heading = false,
}: {
  name: string | null
  heading?: boolean
}) {
  if (!name) return null
  return heading ? (
    <h1 className="school-name school-name--heading">{name}</h1>
  ) : (
    <p className="school-name">{name}</p>
  )
}
