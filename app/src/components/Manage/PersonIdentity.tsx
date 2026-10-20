import React from 'react'

/** The same compact name/address pair in Accounts and Roles & Access. */
export function PersonIdentity({ name, email }: { name: string; email?: string }) {
  return (
    <span className="lp-manage__who">
      <span className="lp-manage__who-name">{name}</span>
      {email && <span className="lp-manage__who-email">{email}</span>}
    </span>
  )
}
