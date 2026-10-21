/**
 * Manage → System → Backups (design A2–A5): the statements, derived from records, settings and a clock.
 *
 * ⚑ EACH STATEMENT CLAIMS ONLY WHAT THE RECORDS SHOW. The cases below walk every state of every
 * statement, the version-1 transition, a history shorter than the week it describes, and freshness
 * judged by `coversUntil` rather than upload time — the gates the design lists for this PR. The last
 * group pins the readers: a wedged mount, a malformed or oversized file, and a file naming another
 * stream are never evidence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileMock = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, open: fileMock.open }
})

const { ago, collectBackupStatus, deriveBackupStatus, parseAgreement } =
  await import('@/lib/backupStatus')
const { formatInstant } = await import('@/components/Manage/LocalTime')
type StreamRecord = import('@/lib/backupStatus').StreamRecord
type BackupInputs = import('@/lib/backupStatus').BackupInputs
type BackupStatement = import('@/lib/backupStatus').BackupStatement

const NOW = new Date('2026-10-21T12:00:00Z')
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString().replace('.000Z', 'Z')
const daysAgo = (d: number) => hoursAgo(d * 24)

const record = (
  stream: StreamRecord['stream'],
  over: Partial<StreamRecord> = {},
): StreamRecord => ({
  version: 2,
  stream,
  recordingSince: daysAgo(30),
  lastSuccess: null,
  lastFailure: null,
  history: [],
  ...over,
})
const success = (coversUntil: string, completedAt = coversUntil) => ({
  coversUntil,
  completedAt,
  filename: 'lesson3-20261021T020000Z.dump.age',
  encryptedBytes: 7_340_032,
  destination: 'drive:lesson3-backups',
})

const derive = (over: Partial<BackupInputs> = {}) =>
  deriveBackupStatus({ records: [], legacy: null, journal: null, settings: {}, now: NOW, ...over })
const statement = (over: Partial<BackupInputs>, key: BackupStatement['key']): BackupStatement => {
  const found = derive(over).statements.find((s) => s.key === key)
  if (!found) throw new Error(`no ${key} statement`)
  return found
}
const flat = (s: BackupStatement) =>
  [...s.value, ...(s.detail ?? [])].map((p) => (typeof p === 'string' ? p : `<${p.at}>`)).join('')

describe('a server with no records at all', () => {
  const statements = derive().statements
  it('says what is and is not known, statement by statement', () => {
    expect(statements.map((s) => [s.key, s.state, flat(s)])).toEqual([
      ['freshness', 'unknown', 'No backup recorded on this server yet'],
      ['routine', 'unknown', 'Unknown — history incomplete'],
      ['lastAttempt', 'unknown', 'No backup attempt recorded'],
      ['recoveryTime', 'attention', 'Not agreed'],
      ['fullRecovery', 'attention', expect.stringContaining('Not yet tested')],
      ['contact', 'attention', 'Not recorded'],
      ['recoveryKey', 'attention', expect.stringContaining('Recovery needs ARES')],
    ])
  })
})

describe('Backup up to date', () => {
  const daily = (covers: string, completed?: string) =>
    record('daily', { lastSuccess: success(covers, completed), history: [covers] })

  it('reads the version-1 record as history incomplete, never as up to date', () => {
    const s = statement(
      {
        legacy: {
          version: 1,
          completedAt: hoursAgo(2),
          stream: 'daily',
          destination: 'drive:x',
          filename: 'f',
          encryptedBytes: 1,
        },
      },
      'freshness',
    )
    expect(s.state).toBe('unknown')
    expect(flat(s)).toContain('Unknown — history incomplete')
  })

  it('does not count a pre-update snapshot as a routine backup', () => {
    const s = statement(
      { records: [record('premigrate', { lastSuccess: success(hoursAgo(1)) })] },
      'freshness',
    )
    expect(s).toMatchObject({ state: 'attention', value: ['No recent routine backup recorded'] })
    expect(flat(s)).toContain('taken before updates')
  })

  it('says the limit is not agreed when it is unset, and still says what the backup holds', () => {
    const s = statement({ records: [daily(hoursAgo(10))] }, 'freshness')
    expect(s.state).toBe('attention')
    expect(s.value).toEqual(['Backup limit not agreed'])
    expect(s.detail).toEqual(['Work saved before ', { at: hoursAgo(10) }, ' is in a backup.'])
  })

  it('is up to date inside the agreed limit', () => {
    const s = statement(
      { records: [daily(hoursAgo(10))], settings: { maxDataLoss: '1d' } },
      'freshness',
    )
    expect(s.state).toBe('ok')
    expect(flat(s)).toContain('Agreed limit: no more than 1 day of work lost.')
  })

  it('is overdue past it, and says by how much', () => {
    const s = statement(
      { records: [daily(daysAgo(9))], settings: { maxDataLoss: '1d' } },
      'freshness',
    )
    expect(s.state).toBe('attention')
    expect(s.value).toEqual([
      'Backup overdue — the newest backup holds work up to 9 days ago (agreed: 1 day)',
    ])
  })

  it('judges freshness by coversUntil, not by when the upload finished', () => {
    // An old dump uploaded an hour ago is still old data.
    const s = statement(
      { records: [daily(daysAgo(10), hoursAgo(1))], settings: { maxDataLoss: '1w' } },
      'freshness',
    )
    expect(s.state).toBe('attention')
    expect(flat(s)).toContain('10 days ago (agreed: 1 week)')
  })

  it('takes the newest of the routine streams', () => {
    const s = statement(
      {
        records: [daily(daysAgo(5)), record('weekly', { history: [hoursAgo(3)] })],
        settings: { maxDataLoss: '1d' },
      },
      'freshness',
    )
    expect(s.state).toBe('ok')
  })

  it('refuses a limit it cannot read rather than guessing one', () => {
    const s = statement(
      { records: [daily(hoursAgo(1))], settings: { maxDataLoss: 'a week' } },
      'freshness',
    )
    expect(s.value).toEqual(['Backup limit not understood'])
    expect(flat(s)).toContain('“a week”')
  })
})

describe('Routine backups', () => {
  const dailyHistory = (days: number[], since = daysAgo(30)) =>
    record('daily', { recordingSince: since, history: days.map((d) => hoursAgo(d * 24 + 2)) })

  it('says history is incomplete until a full week has been recorded', () => {
    const s = statement({ records: [dailyHistory([0, 1, 2], daysAgo(3))] }, 'routine')
    expect(s.state).toBe('unknown')
    expect(s.value).toEqual(['Unknown — history incomplete'])
    expect(s.detail?.[1]).toEqual({ at: daysAgo(3) })
  })

  it('counts the days that actually had one', () => {
    expect(statement({ records: [dailyHistory([0, 1, 2, 3, 4, 5, 6])] }, 'routine').value).toEqual([
      'Recorded on 7 of the last 7 days',
    ])
    expect(statement({ records: [dailyHistory([0, 2, 4, 6])] }, 'routine').value).toEqual([
      'Recorded on 4 of the last 7 days',
    ])
  })

  it('needs attention when none happened in the week', () => {
    const s = statement({ records: [dailyHistory([10, 11])] }, 'routine')
    expect(s).toMatchObject({ state: 'attention', value: ['No recent routine backup recorded'] })
  })
})

describe('Last attempt', () => {
  it('reports success when the newest event is a success', () => {
    const s = statement(
      {
        records: [
          record('daily', {
            lastSuccess: success(hoursAgo(2)),
            lastFailure: { at: hoursAgo(26), stage: 'upload', reason: 'x' },
          }),
        ],
      },
      'lastAttempt',
    )
    expect(s).toMatchObject({ state: 'ok', value: ['Succeeded ', { at: hoursAgo(2) }] })
  })

  it('names an unplugged drive, and says what to do about it', () => {
    const s = statement(
      {
        settings: { destination: '/media/lesson3-backup' },
        records: [
          record('daily', {
            lastSuccess: success(daysAgo(3)),
            lastFailure: { at: hoursAgo(10), stage: 'destination', reason: 'no sentinel' },
          }),
        ],
      },
      'lastAttempt',
    )
    expect(s.state).toBe('attention')
    expect(s.value).toEqual([
      'Failed ',
      { at: hoursAgo(10) },
      ': the backup drive is not connected',
    ])
    expect(flat(s)).toContain(
      "Connect the school's backup drive and run the backup. Then take the drive away from the server.",
    )
  })

  it('words a cloud failure as a cloud failure', () => {
    const s = statement(
      {
        settings: { destination: 'drive:lesson3-backups' },
        records: [
          record('weekly', { lastFailure: { at: hoursAgo(1), stage: 'upload', reason: 'quota' } }),
        ],
      },
      'lastAttempt',
    )
    expect(flat(s)).toContain('the backup could not be sent')
    expect(flat(s)).not.toContain('drive away')
  })

  it('looks across every stream, pre-update snapshots included', () => {
    const s = statement(
      {
        records: [
          record('daily', { lastSuccess: success(daysAgo(1)) }),
          record('premigrate', { lastFailure: { at: hoursAgo(1), stage: 'dump', reason: 'x' } }),
        ],
      },
      'lastAttempt',
    )
    expect(flat(s)).toContain('the database could not be read')
  })
})

describe('the agreement and who recovers', () => {
  it('shows an agreed recovery time, and "Not agreed" without one', () => {
    expect(statement({ settings: { recoveryTarget: '2d' } }, 'recoveryTime')).toMatchObject({
      state: 'ok',
      value: ['Service back within 2 days'],
    })
    expect(statement({ settings: { recoveryTarget: '' } }, 'recoveryTime').value).toEqual([
      'Not agreed',
    ])
    expect(statement({ settings: { recoveryTarget: '48' } }, 'recoveryTime').value).toEqual([
      'Not understood',
    ])
  })

  it('shows the recovery contact as recorded, not verified', () => {
    expect(
      statement({ settings: { recoveryContact: 'J. Example, +1 555 0100' } }, 'contact'),
    ).toMatchObject({ state: 'ok', value: ['Recorded as: J. Example, +1 555 0100'] })
  })

  it('keeps the two key states the Guide branches on, plus where the key is kept', () => {
    const school = statement(
      { settings: { schoolRecipient: 'age1school', keyHeldBy: 'the head teacher’s safe' } },
      'recoveryKey',
    )
    expect(school).toMatchObject({ state: 'ok', value: ['School recovery key configured'] })
    expect(flat(school)).toContain('Recorded as kept in: the head teacher’s safe')
    expect(flat(school)).toContain('before this key was configured')

    const unrecorded = statement({ settings: { schoolRecipient: 'age1school' } }, 'recoveryKey')
    expect(unrecorded.state).toBe('attention')

    const ares = statement({ settings: { keyHeldBy: 'a password manager' } }, 'recoveryKey')
    expect(ares.value).toEqual(['Recovery needs ARES'])
    expect(flat(ares)).toContain('Recorded as kept in: a password manager')
  })

  it('says full recovery is not yet tested, whatever else is true', () => {
    const everythingFine = derive({
      records: [record('daily', { lastSuccess: success(hoursAgo(1)), history: [hoursAgo(1)] })],
      settings: { maxDataLoss: '1d', recoveryTarget: '1d', recoveryContact: 'x', keyHeldBy: 'y' },
    })
    expect(everythingFine.statements.find((s) => s.key === 'fullRecovery')).toMatchObject({
      state: 'attention',
      value: ['Not yet tested'],
    })
  })
})

describe('a restore in progress', () => {
  const journal = (state: string) => ({
    state,
    backupDate: '2026-10-20',
    startedAt: hoursAgo(2),
    updatedAt: hoursAgo(1),
  })
  const restore = (state: string) =>
    derive({ journal: journal(state) as never }).statements[0] as BackupStatement

  it('comes first, and says a provisional restore can still be undone at a cost', () => {
    const s = restore('provisional')
    expect(s).toMatchObject({ key: 'restore', state: 'attention' })
    expect(flat(s)).toContain('Restored from the backup of 2026-10-20 — provisional')
    expect(flat(s)).toContain('Work saved now would be lost if it is undone.')
  })

  it.each([
    ['checked', 'Preparing a restore', 'attention'],
    ['writers-stopped', 'Replacing the database', 'attention'],
    ['live-check-failed', 'its check failed', 'attention'],
    ['accepted', 'confirmed', 'ok'],
    ['undo-backed-up', 'Undoing the restore', 'attention'],
    ['undone', 'was undone', 'ok'],
  ])('describes %s', (state, words, expected) => {
    const s = restore(state)
    expect(flat(s)).toContain(words)
    expect(s.state).toBe(expected)
  })

  it('shows nothing about restores when none is open', () => {
    expect(derive().statements.some((s) => s.key === 'restore')).toBe(false)
  })
})

describe('the wording rule', () => {
  it('never says protected or recoverable, in any state', () => {
    const variants: Partial<BackupInputs>[] = [
      {},
      { records: [record('daily', { lastSuccess: success(hoursAgo(1)), history: [hoursAgo(1)] })] },
      {
        records: [record('daily', { lastFailure: { at: hoursAgo(1), stage: 'lock', reason: '' } })],
        settings: { maxDataLoss: '1d', recoveryTarget: '2d', schoolRecipient: 'age1x' },
        journal: {
          state: 'provisional',
          backupDate: '2026-10-20',
          startedAt: hoursAgo(2),
          updatedAt: hoursAgo(1),
        },
      },
    ]
    for (const v of variants) {
      for (const s of derive(v).statements) {
        expect(flat(s)).not.toMatch(/protected|recoverable/i)
      }
    }
  })
})

describe('technical details', () => {
  it('give the operator the destination, each stream in UTC, the failure reason and the key', () => {
    const rows = derive({
      settings: { destination: '/media/usb/lesson3', schoolRecipient: 'age1' + 'q'.repeat(58) },
      records: [
        record('daily', {
          lastSuccess: success('2026-10-20T02:00:00Z', '2026-10-20T02:01:30Z'),
          lastFailure: { at: '2026-10-21T02:00:00Z', stage: 'destination', reason: 'no sentinel' },
        }),
      ],
    }).technical
    const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n')
    expect(text).toContain('A removable drive: /media/usb/lesson3')
    expect(text).toContain('daily: last success: holds work up to 2026-10-20 02:00:00 UTC')
    expect(text).toContain(
      'daily: last failure: 2026-10-21 02:00:00 UTC at destination: no sentinel',
    )
    expect(text).toContain('age1qqqqqq…qqqqqq')
  })
})

describe('small parts', () => {
  it('parses agreements strictly', () => {
    expect(parseAgreement('12h')).toEqual({ kind: 'set', ms: 43_200_000, words: '12 hours' })
    expect(parseAgreement('1w')).toEqual({ kind: 'set', ms: 604_800_000, words: '1 week' })
    expect(parseAgreement(undefined)).toEqual({ kind: 'unset' })
    expect(parseAgreement('0d')).toEqual({ kind: 'invalid', raw: '0d' })
    expect(parseAgreement('1.5d')).toEqual({ kind: 'invalid', raw: '1.5d' })
  })

  it('gives relative ages that do not depend on a time zone', () => {
    expect(ago(hoursAgo(0.5), NOW)).toBe('less than an hour ago')
    expect(ago(hoursAgo(5), NOW)).toBe('5 hours ago')
    expect(ago(daysAgo(9), NOW)).toBe('9 days ago')
  })

  it('renders instants as explicit UTC until hydrated, then in the viewer’s own words', () => {
    expect(formatInstant('2026-10-21T02:00:00Z', false)).toBe('21 Oct 2026, 02:00 UTC')
    expect(formatInstant('2026-10-21T11:00:00Z', true, NOW)).toMatch(/^today, .* \(your time\)$/)
  })
})

describe('reading the records', () => {
  type Files = Record<string, unknown>
  const serve = (files: Files) => {
    fileMock.open.mockImplementation(async (path: string) => {
      if (!(path in files)) throw new Error('ENOENT')
      const content = files[path]
      if (content === 'HANG') return new Promise(() => {})
      const bytes = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content))
      return {
        stat: async () => ({ isFile: () => true, size: bytes.byteLength }),
        readFile: vi.fn(async () => bytes),
        close: async () => undefined,
      }
    })
  }
  const dir = '/var/run/lesson3-ops'
  let saved: string | undefined

  beforeEach(() => {
    fileMock.open.mockReset()
    saved = process.env.BACKUP_MAX_DATA_LOSS
    delete process.env.BACKUP_MAX_DATA_LOSS
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.BACKUP_MAX_DATA_LOSS
    else process.env.BACKUP_MAX_DATA_LOSS = saved
  })

  const keyed = async () => {
    const status = await collectBackupStatus(NOW)
    return Object.fromEntries(status.statements.map((s) => [s.key, s]))
  }

  it('reads per-stream records and the restore journal', async () => {
    serve({
      [`${dir}/backup/daily.json`]: record('daily', {
        lastSuccess: success(hoursAgo(3)),
        history: [hoursAgo(3)],
      }),
      [`${dir}/restore-journal.json`]: {
        version: '1',
        id: '20261021T100000Z',
        state: 'provisional',
        backupDate: '2026-10-20',
        startedAt: hoursAgo(2),
        updatedAt: hoursAgo(1),
      },
    })
    const s = await keyed()
    expect(s.lastAttempt.state).toBe('ok')
    expect(s.restore.state).toBe('attention')
  })

  it('ignores a record that names a different stream from its file', async () => {
    serve({ [`${dir}/backup/daily.json`]: record('weekly', { lastSuccess: success(hoursAgo(1)) }) })
    expect((await keyed()).lastAttempt.value).toEqual(['No backup attempt recorded'])
  })

  it('does not mistake malformed records for evidence', async () => {
    serve({
      [`${dir}/backup/daily.json`]: { version: 2, stream: 'daily', lastSuccess: 'yesterday' },
      // JavaScript rolls Feb 30 to March 2; it is not a backup that completed on Feb 30.
      [`${dir}/backup/weekly.json`]: record('weekly', {
        lastSuccess: success('2026-02-30T03:25:34Z'),
      }),
      [`${dir}/backup-status.json`]: { version: 1, completedAt: 'yesterday' },
    })
    const s = await keyed()
    expect(s.freshness.value).toEqual(['No backup recorded on this server yet'])
    expect(s.lastAttempt.value).toEqual(['No backup attempt recorded'])
  })

  it('never reads an oversized file', async () => {
    const readFile = vi.fn()
    fileMock.open.mockImplementation(async (path: string) => {
      if (path !== `${dir}/backup/daily.json`) throw new Error('ENOENT')
      return {
        stat: async () => ({ isFile: () => true, size: 8_193 }),
        readFile,
        close: async () => {},
      }
    })
    await keyed()
    expect(readFile).not.toHaveBeenCalled()
  })

  /**
   * ⚑ THE HANG IS THE FAILURE MODE A BIND MOUNT ADDS. An unbounded read would not degrade one
   * statement, it would hold the whole Manage page open. (Moved from systemFacts.spec with the reader.)
   */
  it('gives up on a wedged mount instead of hanging the page', async () => {
    serve({ [`${dir}/backup/daily.json`]: 'HANG', [`${dir}/restore-journal.json`]: 'HANG' })
    const started = Date.now()
    const s = await keyed()
    expect(s.freshness.state).toBe('unknown')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('reports the version-1 file only while no version-2 record exists', async () => {
    const v1 = {
      version: 1,
      completedAt: hoursAgo(5),
      stream: 'daily',
      destination: 'drive:x',
      filename: 'old.dump.age',
      encryptedBytes: 9,
    }
    serve({ [`${dir}/backup-status.json`]: v1 })
    expect((await keyed()).freshness.value).toEqual(['Unknown — history incomplete'])
    serve({
      [`${dir}/backup-status.json`]: v1,
      [`${dir}/backup/daily.json`]: record('daily', {
        lastSuccess: success(hoursAgo(1)),
        history: [hoursAgo(1)],
      }),
    })
    expect((await keyed()).freshness.value).toEqual(['Backup limit not agreed'])
  })
})
