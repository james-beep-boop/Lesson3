import { open } from 'fs/promises'
import { join } from 'path'

import { decodeCachedJson } from '../generator/cacheCodecs'
import { mb } from './systemFacts'

/**
 * Manage → System → Backups (design A2–A5, `docs/DESIGN-backup-recovery-2026-10-21.md`).
 *
 * ⚑ FACTUAL STATEMENTS ONLY, AND NO OVERALL "PROTECTED". Each statement claims exactly what a record
 * or a setting shows, with its own state: up to date (`ok`), `attention`, or `unknown`. Nothing here
 * may say an installation is protected or recoverable: until Phase B's acceptance test has passed on a
 * clean machine, "Full recovery" reads "Not yet tested" (DECISIONS 2026-10-21).
 *
 * ⚑ REPORTED, NEVER CONTROLLED (DECISIONS 2026-10-04). The host's `backup-db.sh` is the sole writer
 * of the records and `restore-db.sh` of the restore journal; the app reads `out/ops` through a
 * read-only mount. Nothing here starts a backup or a restore.
 *
 * The derivation (`deriveBackupStatus`) is pure — records, settings and a clock in, statements out —
 * so every state is unit-tested without a filesystem; `collectBackupStatus` only reads and bounds.
 */

export type StatementState = 'ok' | 'attention' | 'unknown'

/**
 * Text with instants in it. An instant is rendered in the VIEWER's local time by the panel (a server
 * render cannot know the viewer's zone), so statements carry the ISO string, never a formatted one.
 */
export type Text = (string | { at: string })[]

export interface BackupStatement {
  key:
    | 'freshness'
    | 'routine'
    | 'lastAttempt'
    | 'recoveryTime'
    | 'fullRecovery'
    | 'contact'
    | 'recoveryKey'
    | 'restore'
  label: string
  state: StatementState
  value: Text
  detail?: Text
}

export interface BackupStatus {
  statements: BackupStatement[]
  /** True when backups go to a mounted drive, which changes the action line a failure needs. */
  removable: boolean
  /** Shown under "Technical details (for the server operator)", in UTC. */
  technical: { label: string; value: string }[]
}

// ─── Records ─────────────────────────────────────────────────────────────────────────────────────────

const OPS_DIR = '/var/run/lesson3-ops'
const BACKUP_RECORD_DIR = join(OPS_DIR, 'backup')
const LEGACY_STATUS_FILE = join(OPS_DIR, 'backup-status.json')
const RESTORE_JOURNAL_FILE = join(OPS_DIR, 'restore-journal.json')
const MAX_RECORD_BYTES = 8_192
const READ_TIMEOUT_MS = 1_000

export const BACKUP_STREAMS = ['daily', 'weekly', 'monthly', 'premigrate'] as const
export type BackupStream = (typeof BACKUP_STREAMS)[number]
const ROUTINE: readonly BackupStream[] = ['daily', 'weekly', 'monthly']

const FAILURE_STAGES = [
  'setup',
  'lock',
  'destination',
  'dump',
  'encrypt',
  'upload',
  'record',
] as const
type FailureStage = (typeof FAILURE_STAGES)[number]

/**
 * `seq` orders attempts across every stream: `backup-db.sh` advances one counter under its lock, because
 * whole-second times can tie (review 2026-10-21). Records written before it existed have none.
 */
export interface BackupSuccess {
  seq?: number
  coversUntil: string
  completedAt: string
  filename: string
  encryptedBytes: number
  destination: string
}

export interface BackupFailure {
  seq?: number
  at: string
  stage: FailureStage
  reason: string
}

/** Version 2: one per stream, written by `backup-db.sh` under its lock. */
export interface StreamRecord {
  version: 2
  stream: BackupStream
  recordingSince: string
  lastSuccess: BackupSuccess | null
  lastFailure: BackupFailure | null
  history: string[]
}

/** Version 1: the single latest-success file written before per-stream records existed. */
export interface LegacyRecord {
  version: 1
  completedAt: string
  stream: BackupStream
  destination: string
  filename: string
  encryptedBytes: number
}

const isBounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/**
 * ⚑ THREE TIMESTAMP CHECKS, THREE DIFFERENT CLASSES — do not "simplify" this to one. Measured:
 *   - `2026-08-21T10:00:00.500Z` / `…+00:00` — the REGEX is the only thing that rejects a shape the
 *     writer never emits (`date -u +%Y-%m-%dT%H:%M:%SZ`), and shape drift is how a contract rots.
 *   - `2026-02-30T10:00:00Z` — parses fine and is NOT NaN; JavaScript rolls it to March 2. Only the
 *     round-trip comparison notices, and "a backup completed on Feb 30" is exactly the kind of false
 *     record this whole file exists to refuse.
 *   - `2026-13-45T99:99:99Z` — passes the regex, IS NaN, and makes `toISOString()` throw `RangeError`.
 *     The NaN guard keeps that a `false` here instead of an exception inside a type predicate.
 * (Moved from `systemFacts.ts` with the version-1 reader, 2026-10-21.)
 */
export const isIsoUtcSeconds = (value: unknown): value is string => {
  if (!isBounded(value, 64)) return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString() === value.replace('Z', '.000Z')
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSeq = (value: unknown): boolean =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) > 0)

const isSuccess = (value: unknown): value is BackupSuccess =>
  isObject(value) &&
  isSeq(value.seq) &&
  isIsoUtcSeconds(value.coversUntil) &&
  isIsoUtcSeconds(value.completedAt) &&
  isBounded(value.filename, 512) &&
  isBounded(value.destination, 1_024) &&
  Number.isSafeInteger(value.encryptedBytes) &&
  (value.encryptedBytes as number) > 0

const isFailure = (value: unknown): value is BackupFailure =>
  isObject(value) &&
  isSeq(value.seq) &&
  isIsoUtcSeconds(value.at) &&
  FAILURE_STAGES.includes(value.stage as FailureStage) &&
  typeof value.reason === 'string' &&
  value.reason.length <= 1_024

export const isStreamRecord = (value: unknown): value is StreamRecord =>
  isObject(value) &&
  value.version === 2 &&
  BACKUP_STREAMS.includes(value.stream as BackupStream) &&
  isIsoUtcSeconds(value.recordingSince) &&
  (value.lastSuccess === null || isSuccess(value.lastSuccess)) &&
  (value.lastFailure === null || isFailure(value.lastFailure)) &&
  Array.isArray(value.history) &&
  value.history.length <= 31 &&
  value.history.every(isIsoUtcSeconds)

export const isLegacyRecord = (value: unknown): value is LegacyRecord =>
  isObject(value) &&
  value.version === 1 &&
  isIsoUtcSeconds(value.completedAt) &&
  BACKUP_STREAMS.includes(value.stream as BackupStream) &&
  isBounded(value.destination, 1_024) &&
  isBounded(value.filename, 512) &&
  Number.isSafeInteger(value.encryptedBytes) &&
  (value.encryptedBytes as number) > 0

const JOURNAL_STATES = [
  'staging',
  'migrating',
  'checking',
  'checked',
  'approved',
  'writers-stopped',
  'swapped',
  'starting',
  'provisional',
  'live-check-failed',
  'accepted',
  'undo-approved',
  'undo-services-stopped',
  'undo-backed-up',
  'undo-swapped',
  'undone',
] as const
type JournalState = (typeof JOURNAL_STATES)[number]

/** The fields of `out/ops/restore-journal.json` (written by `restore-db.sh`) that the page shows. */
export interface RestoreJournal {
  state: JournalState
  backupDate: string
  startedAt: string
  updatedAt: string
}

export const isRestoreJournal = (value: unknown): value is RestoreJournal =>
  isObject(value) &&
  JOURNAL_STATES.includes(value.state as JournalState) &&
  typeof value.backupDate === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.backupDate) &&
  isIsoUtcSeconds(value.startedAt) &&
  isIsoUtcSeconds(value.updatedAt)

// ─── Settings: the school's agreement and who recovers (A3, A4) ──────────────────────────────────────

const UNIT_MS = { h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const
const UNIT_WORD = { h: 'hour', d: 'day', w: 'week' } as const

type Agreement =
  { kind: 'unset' } | { kind: 'invalid'; raw: string } | { kind: 'set'; ms: number; words: string }

/** `12h`, `1d`, `2w`. Anything else is "not understood" — never silently a default. */
export function parseAgreement(raw: string | undefined): Agreement {
  const value = raw?.trim()
  if (!value) return { kind: 'unset' }
  const match = /^([1-9][0-9]{0,3})([hdw])$/.exec(value)
  if (!match) return { kind: 'invalid', raw: value }
  const n = Number(match[1])
  const unit = match[2] as keyof typeof UNIT_MS
  return {
    kind: 'set',
    ms: n * UNIT_MS[unit],
    words: `${n} ${UNIT_WORD[unit]}${n === 1 ? '' : 's'}`,
  }
}

export interface BackupSettings {
  destination?: string
  maxDataLoss?: string
  recoveryTarget?: string
  recoveryContact?: string
  keyHeldBy?: string
  schoolRecipient?: string
}

/**
 * Read per request, like every other System row. ⚑ NOT `BACKUP_AGE_RECIPIENT` (ARES's key): the app
 * has no reason to read it, and declaring it in `.env.example` would put an empty
 * `BACKUP_AGE_RECIPIENT=` into new installs — which `scripts/deploy.sh` reads as "backups configured".
 */
export const backupSettingsFromEnv = (): BackupSettings => ({
  destination: process.env.BACKUP_RCLONE_REMOTE?.trim() || undefined,
  maxDataLoss: process.env.BACKUP_MAX_DATA_LOSS,
  recoveryTarget: process.env.RECOVERY_TARGET_TIME,
  recoveryContact: process.env.BACKUP_RECOVERY_CONTACT?.trim() || undefined,
  keyHeldBy: process.env.BACKUP_KEY_HELD_BY?.trim() || undefined,
  schoolRecipient: process.env.BACKUP_AGE_RECIPIENT_SCHOOL?.trim() || undefined,
})

// ─── Derivation (pure) ───────────────────────────────────────────────────────────────────────────────

export interface BackupInputs {
  records: StreamRecord[]
  legacy: LegacyRecord | null
  journal: RestoreJournal | null
  settings: BackupSettings
  now: Date
}

const DAY_MS = 86_400_000

/** A relative age for an instant in the past, independent of anyone's time zone. */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (ms < 3_600_000) return 'less than an hour ago'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.floor(ms / DAY_MS)} days ago`
}

const latest = (values: string[]): string | null =>
  values.length ? values.reduce((a, b) => (a > b ? a : b)) : null

/** A removable destination is an absolute path (`backup-db.sh` requires a separate, marked mount). */
export const isRemovableDestination = (destination: string | undefined): boolean =>
  !!destination && destination.startsWith('/')

const STAGE_WORDS: Record<FailureStage, (removable: boolean) => string> = {
  setup: () => 'the backup is not set up correctly on the server',
  lock: () => 'another backup was still running',
  destination: (removable) =>
    removable ? 'the backup drive is not connected' : 'the backup location could not be used',
  dump: () => 'the database could not be read',
  encrypt: () => 'the backup could not be encrypted',
  upload: (removable) =>
    removable ? 'the backup could not be written to the drive' : 'the backup could not be sent',
  record: () => 'the result could not be recorded',
}

const shortKey = (key: string): string =>
  key.length > 20 ? `${key.slice(0, 10)}…${key.slice(-6)}` : key

export function deriveBackupStatus(input: BackupInputs): BackupStatus {
  const { records, legacy, journal, settings, now } = input
  const removable = isRemovableDestination(settings.destination)
  const routine = records.filter((r) => ROUTINE.includes(r.stream))
  const haveRecords = records.length > 0
  const statements: BackupStatement[] = []

  // ── A restore that is open goes first: it changes what every other line means. ──
  if (journal) statements.push(restoreStatement(journal))

  // ── Backup up to date: judged by coversUntil, never by upload time (A2). ──
  const newestCovers = latest(
    routine.flatMap((r) => [...r.history, ...(r.lastSuccess ? [r.lastSuccess.coversUntil] : [])]),
  )
  const limit = parseAgreement(settings.maxDataLoss)
  const freshness = (state: StatementState, value: Text, detail?: Text): BackupStatement => ({
    key: 'freshness',
    label: 'Backup up to date',
    state,
    value,
    detail,
  })
  if (!haveRecords) {
    statements.push(
      legacy
        ? freshness(
            'unknown',
            ['Unknown — history incomplete'],
            [
              'The newest record predates this version of the backup script and does not say which ' +
                'work it holds. The next backup will say.',
            ],
          )
        : freshness('unknown', ['No backup recorded on this server yet']),
    )
  } else if (!newestCovers) {
    // ⚑ NO ROUTINE RECORD YET IS NOT "NO ROUTINE BACKUPS". After an update the first new-format record
    // is often a pre-update snapshot, while routine backups are still described only by the older file
    // — or have simply not run since records began. Until the records cover the period being judged,
    // the honest answer is "Unknown — history incomplete" (design A2; review 2026-10-21).
    const begun = earliest(records.map((r) => r.recordingSince))
    const window = limit.kind === 'set' ? limit.ms : 7 * DAY_MS
    // ⚑ The older file suppresses the finding only during that window, not forever: it stays on disk
    // after the switch, so treating its presence alone as "history incomplete" would hide a month with
    // no routine backup (review 2026-10-22).
    if (begun && now.getTime() - new Date(begun).getTime() < window) {
      statements.push(
        freshness(
          'unknown',
          ['Unknown — history incomplete'],
          begun
            ? ['Records began ', { at: begun }, '; no routine backup has been recorded since.']
            : [],
        ),
      )
    } else {
      statements.push(
        freshness(
          'attention',
          ['No recent routine backup recorded'],
          ['Routine backups need to be set up, or they are failing: see Last attempt.'],
        ),
      )
    }
  } else {
    const covered: Text = ['Work saved before ', { at: newestCovers }, ' is in a backup.']
    if (limit.kind === 'unset') {
      statements.push(freshness('attention', ['Backup limit not agreed'], covered))
    } else if (limit.kind === 'invalid') {
      statements.push(
        freshness(
          'attention',
          ['Backup limit not understood'],
          [
            ...covered,
            ` The server setting reads “${limit.raw}”; it should look like 12h, 1d or 1w.`,
          ],
        ),
      )
    } else if (now.getTime() - new Date(newestCovers).getTime() > limit.ms) {
      statements.push(
        freshness(
          'attention',
          [
            `Backup overdue — the newest backup holds work up to ${ago(newestCovers, now)} ` +
              `(agreed: ${limit.words})`,
          ],
          covered,
        ),
      )
    } else {
      statements.push(
        freshness('ok', covered, [`Agreed limit: no more than ${limit.words} of work lost.`]),
      )
    }
  }

  // ── Routine backups: what actually happened over the last 7 days, not what a schedule intends. ──
  const routineStatement = (
    state: StatementState,
    value: Text,
    detail?: Text,
  ): BackupStatement => ({
    key: 'routine',
    label: 'Routine backups',
    state,
    value,
    detail,
  })
  const since = earliest(routine.map((r) => r.recordingSince))
  if (!haveRecords || !since) {
    statements.push(routineStatement('unknown', ['Unknown — history incomplete']))
  } else if (now.getTime() - new Date(since).getTime() < 7 * DAY_MS) {
    statements.push(
      routineStatement(
        'unknown',
        ['Unknown — history incomplete'],
        [
          'Records began ',
          { at: since },
          '; a full week is needed to say how many days had a backup.',
        ],
      ),
    )
  } else {
    const history = routine.flatMap((r) => r.history).map((iso) => new Date(iso).getTime())
    let days = 0
    for (let i = 0; i < 7; i++) {
      const end = now.getTime() - i * DAY_MS
      if (history.some((t) => t <= end && t > end - DAY_MS)) days++
    }
    statements.push(
      days === 0
        ? routineStatement('attention', ['No recent routine backup recorded'])
        : routineStatement('ok', [`Recorded on ${days} of the last 7 days`]),
    )
  }

  // ── Last attempt: the newest event of any stream. ──
  const events: Attempt[] = records.flatMap((r) => [
    ...(r.lastSuccess
      ? [{ at: r.lastSuccess.completedAt, seq: r.lastSuccess.seq, failure: null }]
      : []),
    ...(r.lastFailure
      ? [{ at: r.lastFailure.at, seq: r.lastFailure.seq, failure: r.lastFailure }]
      : []),
  ])
  const last = events.length ? events.reduce((a, b) => (isLater(b, a) ? b : a)) : null
  if (last?.failure) {
    statements.push({
      key: 'lastAttempt',
      label: 'Last attempt',
      state: 'attention',
      value: ['Failed ', { at: last.at }, `: ${STAGE_WORDS[last.failure.stage](removable)}`],
      detail:
        removable && ['destination', 'upload'].includes(last.failure.stage)
          ? [
              "Connect the school's backup drive and run the backup. Then take the drive away " +
                'from the server.',
            ]
          : ['The server operator can see the reason under Technical details below.'],
    })
  } else if (last) {
    statements.push({
      key: 'lastAttempt',
      label: 'Last attempt',
      state: 'ok',
      value: ['Succeeded ', { at: last.at }],
    })
  } else {
    statements.push({
      key: 'lastAttempt',
      label: 'Last attempt',
      state: 'unknown',
      value: legacy
        ? ['A backup succeeded ', { at: legacy.completedAt }]
        : ['No backup attempt recorded'],
      detail: legacy
        ? ['Failed attempts were not recorded before this version of the backup script.']
        : undefined,
    })
  }

  // ── The school's agreement (A3): displayed in Phase A, measured by Phase B. ──
  const target = parseAgreement(settings.recoveryTarget)
  statements.push({
    key: 'recoveryTime',
    label: 'Agreed recovery time',
    state: target.kind === 'set' ? 'ok' : 'attention',
    value:
      target.kind === 'set'
        ? [`Service back within ${target.words}`]
        : target.kind === 'invalid'
          ? ['Not understood']
          : ['Not agreed'],
    detail:
      target.kind === 'invalid'
        ? [`The server setting reads “${target.raw}”; it should look like 12h, 1d or 1w.`]
        : undefined,
  })

  // ── Full recovery: only a demonstrated Phase B recovery may change this line. ──
  statements.push({
    key: 'fullRecovery',
    label: 'Full recovery',
    state: 'attention',
    value: ['Not yet tested'],
    detail: [
      'Rebuilding this installation on another machine from its backups has not been tested. A ' +
        'backup existing is not the same as a recovery that has been shown to work.',
    ],
  })

  // ── Who recovers (A4): recorded, not verified. ──
  statements.push({
    key: 'contact',
    label: 'Who recovers',
    state: settings.recoveryContact ? 'ok' : 'attention',
    value: settings.recoveryContact
      ? [`Recorded as: ${settings.recoveryContact}`]
      : ['Not recorded'],
  })

  // ── The recovery key: who can open these backups, and where the private key is kept. ──
  const heldBy: Text = settings.keyHeldBy
    ? [`Recorded as kept in: ${settings.keyHeldBy}`]
    : ['Where the private key is kept is not recorded.']
  statements.push(
    settings.schoolRecipient
      ? {
          key: 'recoveryKey',
          label: 'School recovery key',
          state: settings.keyHeldBy ? 'ok' : 'attention',
          value: ['School recovery key configured'],
          detail: [
            ...heldBy,
            " Backups are encrypted to this school's key as well as ARES's. Backups written " +
              'before this key was configured can still only be opened by ARES.',
          ],
        }
      : {
          key: 'recoveryKey',
          label: 'School recovery key',
          state: 'attention',
          value: ['Recovery needs ARES'],
          detail: [
            ...heldBy,
            ' Only ARES holds a key that opens these backups, so a recovery needs ARES.',
          ],
        },
  )

  return { statements, removable, technical: technicalDetails(input) }
}

interface Attempt {
  at: string
  seq?: number
  failure: BackupFailure | null
}

/**
 * Is `a` a later attempt than `b`? The attempt number decides when both have one. Otherwise time does,
 * and a TIE goes to the failure: whole seconds cannot say which came last, and "Succeeded" is the
 * reading that could hide a problem (review 2026-10-21).
 */
export function isLater(a: Attempt, b: Attempt): boolean {
  if (a.seq !== undefined && b.seq !== undefined) return a.seq > b.seq
  if (a.at !== b.at) return a.at > b.at
  return a.failure !== null && b.failure === null
}

function earliest(values: string[]): string | null {
  return values.length ? values.reduce((a, b) => (a < b ? a : b)) : null
}

function restoreStatement(journal: RestoreJournal): BackupStatement {
  const from = `the backup of ${journal.backupDate}`
  const base = { key: 'restore' as const, label: 'Restore' }
  switch (journal.state) {
    case 'provisional':
      return {
        ...base,
        state: 'attention',
        value: [`Restored from ${from} — provisional`],
        detail: [
          'The database was replaced ',
          { at: journal.updatedAt },
          '. The previous data is kept until the server operator confirms the restore or undoes ' +
            'it. Work saved now would be lost if it is undone.',
        ],
      }
    case 'live-check-failed':
      return {
        ...base,
        state: 'attention',
        value: [`Restored from ${from} — its check failed after starting`],
        detail: [
          'The previous data is kept. The server operator should undo this restore. Work saved now ' +
            'would be lost by undoing it.',
        ],
      }
    case 'accepted':
      return {
        ...base,
        state: 'ok',
        value: [`Restored from ${from}; confirmed`],
        detail: [
          'The previous data is still kept on the server until the operator removes it; until ' +
            'then the restore can still be undone, which would lose work saved since.',
        ],
      }
    case 'undone':
      return {
        ...base,
        state: 'ok',
        value: [`A restore from ${from} was undone`],
        detail: ['The data from before the restore is live again.'],
      }
    case 'undo-approved':
    case 'undo-services-stopped':
    case 'undo-backed-up':
    case 'undo-swapped':
      return { ...base, state: 'attention', value: [`Undoing the restore from ${from}`] }
    case 'approved':
    case 'writers-stopped':
    case 'swapped':
    case 'starting':
      return { ...base, state: 'attention', value: [`Replacing the database from ${from}`] }
    default:
      return {
        ...base,
        state: 'attention',
        value: [`Preparing a restore from ${from}`],
        detail: ['Nothing has been replaced yet.'],
      }
  }
}

const utc = (iso: string): string => iso.replace('T', ' ').replace('Z', ' UTC')

function technicalDetails({ records, legacy, settings }: BackupInputs): BackupStatus['technical'] {
  const rows: BackupStatus['technical'] = [
    {
      label: 'Destination (BACKUP_RCLONE_REMOTE)',
      value: settings.destination
        ? `${isRemovableDestination(settings.destination) ? 'A removable drive' : 'A cloud location'}: ${settings.destination}`
        : 'Not set — no backups can run until this is set',
    },
  ]
  for (const stream of BACKUP_STREAMS) {
    const record = records.find((r) => r.stream === stream)
    if (!record) continue
    const s = record.lastSuccess
    rows.push({
      label: `${stream}: last success`,
      value: s
        ? `holds work up to ${utc(s.coversUntil)}; completed ${utc(s.completedAt)}; ${s.filename}, ${mb(s.encryptedBytes)}`
        : 'none recorded',
    })
    if (record.lastFailure) {
      rows.push({
        label: `${stream}: last failure`,
        value: `${utc(record.lastFailure.at)} at ${record.lastFailure.stage}: ${record.lastFailure.reason}`,
      })
    }
  }
  if (legacy) {
    rows.push({
      label: 'Older record (backup-status.json)',
      value: `${legacy.stream} backup completed ${utc(legacy.completedAt)}; ${legacy.filename}`,
    })
  }
  rows.push({
    label: 'School recipient (BACKUP_AGE_RECIPIENT_SCHOOL)',
    value: settings.schoolRecipient ? shortKey(settings.schoolRecipient) : 'Not set',
  })
  rows.push({
    label: 'Agreement and contact settings',
    value:
      'BACKUP_MAX_DATA_LOSS, RECOVERY_TARGET_TIME, BACKUP_RECOVERY_CONTACT, BACKUP_KEY_HELD_BY',
  })
  return rows
}

// ─── Reading (bounded, never throws) ─────────────────────────────────────────────────────────────────

/**
 * ⚑ THE FILESYSTEM GETS A DEADLINE, exactly like the network probe. These read a bind mount of a host
 * directory, and a wedged mount with no bound would hang the whole Manage page for the Site
 * Administrator who most likely opened it BECAUSE something was already broken. Failure and timeout
 * both collapse to `null`; the operator's next step is the same either way.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([work.catch(() => null), deadline]).finally(() => clearTimeout(timer))
}

/**
 * ⚑ BOUNDED BEFORE IT IS READ, AND THEN AGAIN AFTER. `stat` short-circuits an oversized file so it is
 * never slurped; the second check exists because a reported size is not a promise — a pipe or a
 * synthetic file can stat as 0 and still stream.
 */
async function readJson<T>(path: string, guard: (v: unknown) => v is T): Promise<T | null> {
  const file = await open(path, 'r')
  try {
    const metadata = await file.stat()
    if (!metadata.isFile() || metadata.size > MAX_RECORD_BYTES) return null
    const bytes = await file.readFile()
    if (bytes.byteLength > MAX_RECORD_BYTES) return null
    return decodeCachedJson(bytes, guard)
  } finally {
    await file.close()
  }
}

const read = <T>(path: string, guard: (v: unknown) => v is T) =>
  withDeadline(readJson(path, guard), READ_TIMEOUT_MS)

export async function collectBackupStatus(now = new Date()): Promise<BackupStatus> {
  const [records, legacy, journal] = await Promise.all([
    Promise.all(
      BACKUP_STREAMS.map(async (stream) => {
        const record = await read(join(BACKUP_RECORD_DIR, `${stream}.json`), isStreamRecord)
        // A file whose content names another stream is not this stream's evidence.
        return record?.stream === stream ? record : null
      }),
    ),
    read(LEGACY_STATUS_FILE, isLegacyRecord),
    read(RESTORE_JOURNAL_FILE, isRestoreJournal),
  ])
  return deriveBackupStatus({
    records: records.filter((r): r is StreamRecord => r !== null),
    legacy,
    journal,
    settings: backupSettingsFromEnv(),
    now,
  })
}

/** For the path-parity test: the container directory and file names this reader uses. */
export const BACKUP_PATHS = { BACKUP_RECORD_DIR, RESTORE_JOURNAL_FILE }
