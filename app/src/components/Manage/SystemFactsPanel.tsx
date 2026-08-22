import React from 'react'

import type { SystemFact } from '../../lib/systemFacts'

/**
 * Manage → System → Deployment: the read-only half.
 *
 * ⚑ REPORTED, NOT CONTROLLED, AND IT MUST LOOK LIKE IT. Every row here is decided at boot, so each one
 * names the environment variable that decides it. D1's rule: "A toggle that silently does nothing until
 * restart is worse than no toggle; this is the half that cannot be runtime-switched, and it must look
 * like it." No control renders in this panel — not a disabled one either, since a disabled switch still
 * invites the click.
 *
 * ⚑ NO CLIENT COMPONENT. There is nothing interactive, so this stays a server-rendered list: the facts
 * are computed per request by `lib/systemFacts.ts` and never persisted, and shipping a client bundle to
 * display six strings would be the wrong trade.
 *
 * Presentational only — it receives facts and renders them, so the probing (which does I/O and a
 * network call) is testable without React and this is testable without a database.
 */
export function SystemFactsPanel({ facts }: { facts: SystemFact[] }) {
  return (
    <ul className="lp-manage__list">
      {facts.map((fact) => (
        <li key={fact.key} className="lp-manage__row lp-manage__row--tight">
          <span className="lp-manage__who">
            {fact.label}
            {/* The env var travels with the value, because "email: not configured" without
                "SMTP_HOST" is a dead end for whoever has to fix it. */}
            {fact.envVar && <span className="lp-manage__who-email">{fact.envVar}</span>}
            {fact.detail && <span className="lp-manage__fact-detail">{fact.detail}</span>}
          </span>
          {/* `data-status` rather than three class names: the three states are one axis, and the
              stylesheet can then key off it without this component knowing the colours. */}
          <span className="lp-manage__fact-value" data-status={fact.status}>
            {fact.value}
          </span>
        </li>
      ))}
    </ul>
  )
}
