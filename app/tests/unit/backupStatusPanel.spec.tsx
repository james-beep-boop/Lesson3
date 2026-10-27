import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BackupStatusPanel } from '@/components/Manage/BackupStatusPanel'
import { deriveBackupStatus } from '@/lib/backupStatus'

describe('school recovery key presentation', () => {
  it('renders the setup date as a calendar day before hydration', () => {
    const status = deriveBackupStatus({
      records: [],
      legacy: null,
      journal: null,
      settings: {
        schoolRecipient: 'age1schoolrecipient',
        keyLockedAt: '2026-10-26T23:30:00Z',
      },
      now: new Date('2026-10-27T01:00:00Z'),
    })
    const html = renderToStaticMarkup(<BackupStatusPanel status={status} />)
    expect(html).toContain('Password-locked (set up ')
    expect(html).toMatch(/<time[^>]*>26 Oct 2026<\/time>/)
    expect(html).not.toContain('23:30 UTC')
    expect(html).toContain('encrypted backup, school-recovery-key.age and the backup password')
  })
})
