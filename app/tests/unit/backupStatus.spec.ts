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

const { ago, collectBackupStatus, collectBackupEvidence, deriveBackupStatus, parseAgreement } =
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
  lastAttempt: over.lastSuccess
    ? { outcome: 'success', at: over.lastSuccess.completedAt, seq: over.lastSuccess.seq }
    : null,
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
    // Records have run for 30 days and none was routine: that is a finding, not missing history.
    const s = statement(
      { records: [record('premigrate', { lastSuccess: success(hoursAgo(1)) })] },
      'freshness',
    )
    expect(s).toMatchObject({ state: 'attention', value: ['No recent routine backup recorded'] })
    // ⚑ The design forbids "only pre-update snapshots" as a reading; the line says what to check.
    expect(flat(s)).not.toMatch(/before updates/)
  })

  /**
   * ⚑ REVIEW 2026-10-21. The first new-format record after an update is often the update's own
   * snapshot, while routine backups are still described only by the older file. The panel said routine
   * backups needed setting up — a claim the records could not support.
   */
  it('keeps "history incomplete" when the first new record is a pre-update snapshot', () => {
    const legacyDaily = {
      version: 1 as const,
      completedAt: hoursAgo(20),
      stream: 'daily' as const,
      destination: 'drive:x',
      filename: 'f',
      encryptedBytes: 1,
    }
    const s = statement(
      {
        records: [
          record('premigrate', { recordingSince: hoursAgo(1), lastSuccess: success(hoursAgo(1)) }),
        ],
        legacy: legacyDaily,
      },
      'freshness',
    )
    expect(s).toMatchObject({ state: 'unknown', value: ['Unknown — history incomplete'] })
  })

  it('stops letting the older file hide a missing routine backup once the window has passed', () => {
    const legacyDaily = {
      version: 1 as const,
      completedAt: daysAgo(31),
      stream: 'daily' as const,
      destination: 'drive:x',
      filename: 'f',
      encryptedBytes: 1,
    }
    const s = statement(
      {
        records: [
          record('premigrate', { recordingSince: daysAgo(30), lastSuccess: success(daysAgo(30)) }),
        ],
        legacy: legacyDaily,
        settings: { maxDataLoss: '1d' },
      },
      'freshness',
    )
    expect(s).toMatchObject({ state: 'attention', value: ['No recent routine backup recorded'] })
  })

  it('keeps "history incomplete" while records are younger than the period judged', () => {
    const young = { recordingSince: hoursAgo(5), lastSuccess: success(hoursAgo(5)) }
    expect(statement({ records: [record('premigrate', young)] }, 'freshness').value).toEqual([
      'Unknown — history incomplete',
    ])
    // With an agreed limit of 2 hours, five hours of records with no routine backup is a finding.
    expect(
      statement(
        { records: [record('premigrate', young)], settings: { maxDataLoss: '2h' } },
        'freshness',
      ).value,
    ).toEqual(['No recent routine backup recorded'])
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
            lastAttempt: {
              outcome: 'failure',
              at: hoursAgo(10),
              stage: 'destination',
              reason: 'no sentinel',
            },
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
          record('weekly', {
            lastAttempt: { outcome: 'failure', at: hoursAgo(1), stage: 'upload', reason: 'quota' },
          }),
        ],
      },
      'lastAttempt',
    )
    expect(flat(s)).toContain('the backup could not be sent')
    expect(flat(s)).not.toContain('drive away')
  })

  /**
   * ⚑ REVIEW 2026-10-21: whole-second times tie. A success and a later failure in the same second read
   * as "Succeeded"; the attempt number now orders them, and a tie without one goes to the failure.
   */
  it('orders same-second attempts across streams by sequence', () => {
    const at = hoursAgo(1)
    const result = statement(
      {
        records: [
          record('daily', { lastAttempt: { at, seq: 4, outcome: 'success' } }),
          record('weekly', {
            lastAttempt: { at, seq: 5, outcome: 'failure', stage: 'upload', reason: 'quota' },
          }),
        ],
      },
      'lastAttempt',
    )
    expect(result.state).toBe('attention')
  })

  it('lets the attempt number override clock order across streams', () => {
    const s = statement(
      {
        records: [
          record('daily', { lastSuccess: { ...success(hoursAgo(1)), seq: 7 } }),
          record('weekly', {
            lastAttempt: {
              outcome: 'failure',
              at: hoursAgo(2),
              seq: 8,
              stage: 'dump',
              reason: 'x',
            },
          }),
        ],
      },
      'lastAttempt',
    )
    expect(s.state).toBe('attention')
  })

  it('looks across every stream, pre-update snapshots included', () => {
    const s = statement(
      {
        records: [
          record('daily', { lastSuccess: success(daysAgo(1)) }),
          record('premigrate', {
            lastAttempt: { outcome: 'failure', at: hoursAgo(1), stage: 'dump', reason: 'x' },
          }),
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
        records: [
          record('daily', {
            lastAttempt: { outcome: 'failure', at: hoursAgo(1), stage: 'lock', reason: '' },
          }),
        ],
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
          lastAttempt: {
            outcome: 'failure',
            at: '2026-10-21T02:00:00Z',
            stage: 'destination',
            reason: 'no sentinel',
          },
        }),
      ],
    }).technical
    const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n')
    expect(text).toContain('A removable drive: /media/usb/lesson3')
    expect(text).toContain('daily: last success: holds work up to 2026-10-20 02:00:00 UTC')
    expect(text).toContain(
      'daily: last attempt: 2026-10-21 02:00:00 UTC: failure at destination: no sentinel',
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

describe('one lastAttempt per destination stream', () => {
  it.each(['success', 'notConnected', 'failure'] as const)('reads the %s outcome', (outcome) => {
    const lastAttempt =
      outcome === 'failure'
        ? {
            seq: 3,
            at: hoursAgo(1),
            outcome,
            stage: 'space' as const,
            reason: 'Backup drive nearly full',
          }
        : { seq: 3, at: hoursAgo(1), outcome }
    const r = record('daily', { lastSuccess: success(daysAgo(2)), lastAttempt })
    const result = statement({ records: [r], settings: { destinationKind: 'usb' } }, 'lastAttempt')
    expect(result.state).toBe(
      outcome === 'failure' ? 'attention' : outcome === 'success' ? 'ok' : 'unknown',
    )
    expect(flat(result)).toContain(
      outcome === 'failure'
        ? 'backup drive is nearly full'
        : outcome === 'success'
          ? 'Succeeded'
          : 'Not connected',
    )
  })

  it('lastSuccess still drives freshness after a successful lastAttempt', () => {
    const r = record('daily', {
      lastSuccess: success(daysAgo(20)),
      lastAttempt: { seq: 4, at: hoursAgo(1), outcome: 'success' },
    })
    expect(statement({ records: [r] }, 'lastAttempt').state).toBe('ok')
    expect(statement({ records: [r], settings: { maxDataLoss: '1d' } }, 'freshness').state).toBe(
      'attention',
    )
  })
})

describe('reading the records', () => {
  type Files = Record<string, unknown>
  const serve = (files: Files) => {
    fileMock.open.mockImplementation(async (path: string) => {
      if (!(path in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
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
    vi.stubEnv('BACKUP_DISK_DIR', '')
    vi.stubEnv('BACKUP_RCLONE_REMOTE', 'drive:backups')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    if (saved === undefined) delete process.env.BACKUP_MAX_DATA_LOSS
    else process.env.BACKUP_MAX_DATA_LOSS = saved
  })

  const keyed = async () => {
    const status = await collectBackupStatus(NOW)
    return Object.fromEntries(status.statements.map((s) => [s.key, s]))
  }

  it('reads per-stream records and the restore journal', async () => {
    serve({
      [`${dir}/backup/remote/daily.json`]: record('daily', {
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
    expect(s['remote:lastAttempt'].state).toBe('ok')
    expect(s.restore.state).toBe('attention')
  })

  it('refuses an attempt number that is not a positive integer', async () => {
    serve({
      [`${dir}/backup/remote/daily.json`]: record('daily', {
        lastSuccess: { ...success(hoursAgo(1)), seq: 0 },
      }),
    })
    expect((await keyed())['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })

  it('ignores a record that names a different stream from its file', async () => {
    serve({
      [`${dir}/backup/remote/daily.json`]: record('weekly', { lastSuccess: success(hoursAgo(1)) }),
    })
    expect((await keyed())['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })

  it('does not mistake malformed records for evidence', async () => {
    serve({
      [`${dir}/backup/remote/daily.json`]: {
        version: 2,
        stream: 'daily',
        lastSuccess: 'yesterday',
      },
      // JavaScript rolls Feb 30 to March 2; it is not a backup that completed on Feb 30.
      [`${dir}/backup/remote/weekly.json`]: record('weekly', {
        lastSuccess: success('2026-02-30T03:25:34Z'),
      }),
      [`${dir}/backup/remote/backup-status.json`]: { version: 1, completedAt: 'yesterday' },
    })
    const s = await keyed()
    expect(s['remote:freshness'].value).toEqual(['No backup recorded on this server yet'])
    expect(s['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })

  it('never reads an oversized file', async () => {
    const readFile = vi.fn()
    fileMock.open.mockImplementation(async (path: string) => {
      if (path !== `${dir}/backup/remote/daily.json`)
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
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
    serve({ [`${dir}/backup/remote/daily.json`]: 'HANG', [`${dir}/restore-journal.json`]: 'HANG' })
    const started = Date.now()
    const s = await keyed()
    expect(s['remote:freshness'].state).toBe('unknown')
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
    serve({ [`${dir}/backup/remote/backup-status.json`]: v1 })
    expect((await keyed())['remote:freshness'].value).toEqual(['Unknown — history incomplete'])
    serve({
      [`${dir}/backup/remote/backup-status.json`]: v1,
      [`${dir}/backup/remote/daily.json`]: record('daily', {
        lastSuccess: success(hoursAgo(1)),
        history: [hoursAgo(1)],
      }),
    })
    expect((await keyed())['remote:freshness'].value).toEqual(['Backup limit not agreed'])
  })
  it('keeps new destination evidence separate and defaults USB freshness to 30 days', async () => {
    vi.stubEnv('BACKUP_MAX_DATA_LOSS', '1d')
    vi.stubEnv('BACKUP_DISK_DIR', '/var/lib/lesson3-backups')
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    serve({
      [`${dir}/backup/disk/daily.json`]: record('daily', { lastSuccess: success(hoursAgo(1)) }),
      [`${dir}/backup/usb/daily.json`]: record('daily', {
        lastSuccess: success(daysAgo(34)),
        lastAttempt: { outcome: 'notConnected', seq: 2, at: hoursAgo(1), reason: 'Not connected' },
      }),
    })
    const s = await keyed()
    expect(s['disk:freshness'].state).toBe('ok')
    expect(flat(s['disk:freshness'])).toContain(
      'will not survive disk failure, theft, fire or a reinstall wipe',
    )
    expect(s['usb:freshness'].state).toBe('attention')
    expect(s['usb:freshness'].label).toBe('USB backup')
    expect(flat(s['usb:freshness'])).toContain('Plug in the backup drive')
    expect(s['usb:lastAttempt']).toMatchObject({
      state: 'unknown',
      value: ['Not connected ', { at: hoursAgo(1) }],
    })
    expect(s.fullRecovery.value).toEqual(['Not yet tested'])
  })

  it('reports the default disk folder as not set up until it has a backup, without overriding a chosen folder', async () => {
    // The standard folder, as `.env.example` (and so the updater's missing-key check) writes it.
    vi.stubEnv('BACKUP_DISK_DIR', '/var/lib/lesson3-backups')
    vi.stubEnv('BACKUP_RCLONE_REMOTE', 'drive:backups')
    serve({
      [`${dir}/backup/remote/daily.json`]: record('daily', { lastSuccess: success(hoursAgo(1)) }),
    })
    const unset = await keyed()
    expect(unset['disk:freshness']).toMatchObject({ label: 'Disk backup', state: 'unknown' })
    expect(flat(unset['disk:freshness'])).toContain('None set up')
    expect(unset['disk:routine']).toBeUndefined()
    expect(unset['remote:freshness'].label).toBe('Remote backup')

    vi.stubEnv('BACKUP_DISK_DIR', '/srv/school-backups')
    const chosen = await keyed()
    expect(flat(chosen['disk:freshness'])).not.toContain('None set up')
  })

  it('does not treat an absent but recent USB as a failed backup', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    serve({
      [`${dir}/backup/usb/daily.json`]: record('daily', {
        lastSuccess: { ...success(daysAgo(20)), seq: 1 },
        lastAttempt: { outcome: 'notConnected', seq: 2, at: hoursAgo(1), reason: 'Not connected' },
      }),
    })
    const s = await keyed()
    expect(s['usb:freshness'].state).toBe('ok')
    expect(flat(s['usb:freshness'])).toContain('USB reminder limit: 30 days')
    expect(flat(s['usb:freshness'])).not.toContain('Agreed')
    expect(s['usb:lastAttempt'].state).toBe('unknown')
  })

  it('honours a separately configured USB age', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    vi.stubEnv('BACKUP_USB_MAX_AGE', '7d')
    serve({
      [`${dir}/backup/usb/daily.json`]: record('daily', { lastSuccess: success(daysAgo(8)) }),
    })
    expect((await keyed())['usb:freshness'].state).toBe('attention')
  })

  it('keeps relocated older records scoped to the external destination', async () => {
    serve({
      [`${dir}/backup/remote/daily.json`]: record('daily', { lastSuccess: success(hoursAgo(1)) }),
    })
    const evidence = await collectBackupEvidence({
      diskDir: '/backups',
      destination: 'drive:backups',
    })
    expect(evidence.grouped.find((d) => d.kind === 'disk')?.records).toEqual([])
    expect(evidence.grouped.find((d) => d.kind === 'remote')?.records).toHaveLength(1)
  })

  it('reads a destination failure without reviving archived successes', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', 'drive:backups')
    serve({
      [`${dir}/backup/remote/pre3a/daily.json`]: record('daily', {
        lastSuccess: success(hoursAgo(1)),
      }),
      [`${dir}/backup/remote/daily.json`]: record('daily', {
        lastAttempt: {
          outcome: 'failure',
          at: hoursAgo(1),
          stage: 'destination',
          reason: 'Foreign installation',
        },
      }),
    })
    const s = await keyed()
    expect(s['remote:lastAttempt'].state).toBe('attention')
    expect(flat(s['remote:freshness'])).not.toContain('Work saved before')
  })

  it('a damaged new record cannot revive an older success', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', 'drive:backups')
    serve({
      [`${dir}/backup/remote/pre3a/daily.json`]: record('daily', {
        lastSuccess: success(hoursAgo(1)),
      }),
      [`${dir}/backup/remote/daily.json`]: '{damaged',
    })
    expect((await keyed())['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })

  it('continues reading version 1 for external backups alongside new disk records', async () => {
    vi.stubEnv('BACKUP_DISK_DIR', '/backups')
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    serve({
      [`${dir}/backup/disk/daily.json`]: record('daily', { lastSuccess: success(hoursAgo(1)) }),
      [`${dir}/backup/usb/backup-status.json`]: {
        version: 1,
        stream: 'daily',
        completedAt: daysAgo(2),
        destination: '/mnt/usb',
        filename: 'older.dump.age',
        encryptedBytes: 4,
      },
    })
    const s = await keyed()
    expect(s['usb:freshness'].value).toEqual(['Unknown — history incomplete'])
    expect(s['disk:lastAttempt'].state).toBe('ok')
  })

  it('rejects malformed disconnected events instead of displaying them', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    serve({
      [`${dir}/backup/usb/daily.json`]: record('daily', {
        lastAttempt: { outcome: 'notConnected', seq: -1, at: 'yesterday', reason: 'Not connected' },
      }),
    })
    expect((await keyed())['usb:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })
  it('applies the USB reminder age to relocated old-format evidence', async () => {
    vi.stubEnv('BACKUP_RCLONE_REMOTE', '/mnt/usb')
    vi.stubEnv('BACKUP_MAX_DATA_LOSS', '1d')
    serve({
      [`${dir}/backup/usb/daily.json`]: record('daily', { lastSuccess: success(daysAgo(20)) }),
    })
    expect((await keyed())['usb:freshness'].state).toBe('ok')
  })
  it.each([
    { outcome: 'unknown', at: hoursAgo(1) },
    { outcome: 'failure', at: hoursAgo(1), reason: 'missing stage' },
    { outcome: 'notConnected', at: 'yesterday' },
    { outcome: 'success', seq: -1, at: hoursAgo(1) },
  ])('rejects a malformed lastAttempt: %j', async (lastAttempt) => {
    serve({ [`${dir}/backup/remote/daily.json`]: { ...record('daily'), lastAttempt } })
    expect((await keyed())['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
  })

  it('accepts records containing lastAttempt without either retired field', async () => {
    const r = record('daily', {
      lastAttempt: { seq: 1, at: hoursAgo(1), outcome: 'success' },
    })
    serve({ [`${dir}/backup/remote/daily.json`]: r })
    expect((await keyed())['remote:lastAttempt'].state).toBe('ok')
  })

  it('never reads the pre-3a directory layout or revives its records', async () => {
    serve({ [`${dir}/backup/daily.json`]: record('daily', { lastSuccess: success(hoursAgo(1)) }) })
    expect((await keyed())['remote:lastAttempt'].value).toEqual(['No backup attempt recorded'])
    expect(fileMock.open.mock.calls.map(([path]) => path)).not.toContain(`${dir}/backup/daily.json`)
  })

  it('says to add a USB drive when none is configured', async () => {
    serve({})
    const s = await keyed()
    expect(flat(s['usb:freshness'])).toContain(
      'None set up. Add a USB drive for a backup that can leave the building.',
    )
  })

  it('reports password locking only from a valid receipt matching the configured school key', async () => {
    vi.stubEnv('BACKUP_AGE_RECIPIENT_SCHOOL', 'age1schoolrecipient')
    const receipt = {
      version: 1,
      installationId: '11111111-1111-1111-1111-111111111111',
      recipient: 'age1schoolrecipient',
      keyCreatedAt: daysAgo(2),
      completedAt: hoursAgo(1),
    }
    serve({ [`${dir}/backup-setup.json`]: receipt })
    expect((await keyed()).recoveryKey).toMatchObject({
      state: 'ok',
      value: ['Password-locked (set up ', { at: daysAgo(2), dayOnly: true }, ')'],
    })
    serve({ [`${dir}/backup-setup.json`]: { ...receipt, recipient: 'age1otherrecipient' } })
    expect(flat((await keyed()).recoveryKey)).not.toContain('Password-locked')
    serve({ [`${dir}/backup-setup.json`]: { ...receipt, keyCreatedAt: 'yesterday' } })
    expect(flat((await keyed()).recoveryKey)).not.toContain('Password-locked')
  })
})
