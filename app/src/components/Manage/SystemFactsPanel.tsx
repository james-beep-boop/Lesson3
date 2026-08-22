import React from 'react'

import type { SystemFact } from '../../lib/systemFacts'

/**
 * Manage → System → Deployment: the read-only half.
 *
 * ⚑ REPORTED, NOT CONTROLLED, AND IT MUST LOOK LIKE IT. Most rows are decided at boot; backup success
 * is host-recorded operational state. Each names the environment variable that controls the underlying
 * capability or destination. No control renders here — not a disabled one either, since a disabled
 * switch still invites the click.
 *
 * ⚑ NO CLIENT COMPONENT. There is nothing interactive, so this stays a server-rendered list: facts are
 * collected per request by `lib/systemFacts.ts` from environment, probes and the host's read-only backup
 * record. Shipping a client bundle to display these strings would be the wrong trade.
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
                "SMTP_HOST" is a dead end for whoever has to fix it.

                ⚑ ITS OWN CLASS, not the borrowed `__who-email`. Two reasons, and the second cost a red
                gate: an env var is not a person's address, so the stylesheet's own description of
                `__who-email` ("the secondary identifier under a NAME") did not describe this; and
                sharing the class made a page-wide test locator resolve to the Roles & Access panel's
                email span — hidden inside a collapsed box — instead of this one. */}
            {/* ⚑ PLAIN ENGLISH FIRST, then the machinery. The reading order is label → what it does
                → which setting controls it → the state-specific note, because an administrator who
                does not recognise the label needs the sentence before the variable name is of any
                use to them. */}
            {fact.description && (
              <span className="lp-manage__fact-description">{fact.description}</span>
            )}
            {fact.envVar && <span className="lp-manage__fact-env">{fact.envVar}</span>}
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
