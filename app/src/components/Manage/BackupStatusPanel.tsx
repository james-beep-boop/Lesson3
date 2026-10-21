import Link from 'next/link'
import React from 'react'

import type { BackupStatus, Text } from '../../lib/backupStatus'
import { LocalTime } from './LocalTime'

/**
 * Manage → System → Backups (design A5). Factual statements, each with its own state, then what a
 * restore means, then the details an operator needs. Server-rendered; the only client code is the
 * local-time formatter.
 *
 * ⚑ REPORTED, NOT CONTROLLED (DECISIONS 2026-10-04): no button here starts a backup or a restore.
 */
function Render({ text }: { text: Text }) {
  return (
    <>
      {text.map((part, i) =>
        typeof part === 'string' ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <LocalTime key={i} at={part.at} />
        ),
      )}
    </>
  )
}

export function BackupStatusPanel({ status }: { status: BackupStatus }) {
  return (
    <>
      <ul className="lp-manage__list" aria-label="Backup statements">
        {status.statements.map((s) => (
          <li
            key={s.key}
            className="lp-manage__row lp-manage__row--tight lp-manage__row--fact"
            data-statement={s.key}
          >
            <span className="lp-manage__who">
              {s.label}
              {s.detail && (
                <span className="lp-manage__fact-detail">
                  <Render text={s.detail} />
                </span>
              )}
            </span>
            {/* `data-state`, not the facts' `data-status`: three different states (up to date /
                attention / unknown), so their colours are keyed separately in custom.scss. */}
            <span className="lp-manage__fact-value" data-state={s.state}>
              <Render text={s.value} />
            </span>
          </li>
        ))}
      </ul>
      <div className="lp-manage__desc lp-manage__restore-note">
        <p>
          <strong>If you ever need to restore</strong>
        </p>
        <p>
          ⚠ Restoring replaces this server’s data with the backup’s. Work saved after the backup is
          lost. The current data is kept aside until someone removes it.
        </p>
        <p>
          Recovery is done on the server by the person recorded above, with the private key — never
          from this page. Instructions:{' '}
          <Link href="/guide?open=site-admins&at=site-admins.backups">
            Guide → Backups and recovery
          </Link>
          .
        </p>
      </div>
      <details className="lp-manage__technical">
        <summary>Technical details (for the server operator)</summary>
        <dl>
          {status.technical.map((row) => (
            <React.Fragment key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </details>
    </>
  )
}
