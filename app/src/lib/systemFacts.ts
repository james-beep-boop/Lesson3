import { open, readdir, stat } from 'fs/promises'
import { join } from 'path'

import {
  artifactCacheDir,
  artifactCacheMaxBytes,
  isArtifactCacheEntry,
} from '../generator/artifactCache'
import { decodeCachedJson } from '../generator/cacheCodecs'
import { gotenbergUrl } from '../generator/docxToPdf'
import { errorTrackingEnabled } from './errorTracking'
import { isPublicLibraryEnabled } from './publicLibrary'

/**
 * The read-only half of Manage → System: what this installation IS, as opposed to what is switched on.
 *
 * ⚑ REPORTED PER REQUEST, NEVER OPERATOR-AUTHORED HERE. Most rows are computed from the environment or
 * a live probe. Backup success is different: it is recorded operational state written atomically by
 * the host backup script, because no current-environment probe can reconstruct a past upload. Design:
 * `docs/DESIGN-system-panel-2026-08-21.md`.
 *
 * ⚑ AND EVERY FACT NAMES ITS ENV VAR, because these are the settings that CANNOT be runtime-switched
 * and the panel must look like it. D1 is blunt about this: "A toggle that silently does nothing until
 * restart is worse than no toggle; this is the half that cannot be runtime-switched, and it must look
 * like it." `SERVER_URL` drives the CSRF allowlist and Secure cookies at boot; SMTP, error tracking and
 * the PDF engine are wired at startup. Naming the variable is what turns "email: off" from a mystery
 * into an instruction.
 *
 * ⚑ WITH ONE HONEST EXCEPTION: the backup row. `BACKUP_RCLONE_REMOTE` names where backups GO, but it
 * does not decide whether that row reads `ok` or `unknown` — cron, `rclone`, the mount and the script
 * do. So for that row the variable is *where the destination is configured*, not the lever that fixes
 * the row, and the detail line has to carry the actual next step. Stated here because `envVar`'s own
 * doc used to promise "the variable that decides it" for every row, and the exception had been
 * softened two levels downstream (in the panel's JSDoc and a test message) while the definition still
 * made the stronger claim.
 *
 * Nothing in here throws. A probe that fails reports `unknown` — an operator reading "PDF engine:
 * unknown" learns something true, where a 500 on the Manage page teaches them nothing.
 */

/**
 * `ok` — configured and, where probed, reachable. `off` — deliberately not configured, which is a
 * legitimate state for an offline school, not an error. `unknown` — we asked and could not tell.
 */
export type FactStatus = 'ok' | 'off' | 'unknown'

export interface SystemFact {
  key: string
  label: string
  value: string
  status: FactStatus
  /**
   * The environment variable that decides it, named so the operator knows where to go — or, for a
   * recorded-state row, where its destination is configured. See the exception in the module
   * docblock: naming a variable that cannot change the row is a dead end unless `detail` says so.
   */
  envVar?: string
  /**
   * ⚑ PLAIN ENGLISH, ALWAYS SHOWN, AND IT EXISTS BECAUSE THE ROWS WERE UNREADABLE. The labels and
   * values here name components and settings; an administrator who does not already know what a
   * "PDF engine" or an "artifact cache" IS learns nothing from being told its state (operator review
   * of the shipped panel, 2026-08-21). This line says what the thing does, in the words someone
   * running a school would use.
   *
   * It is deliberately NOT state-dependent — that is `detail`'s job. This sentence reads the same
   * whether the row is `ok`, `off` or `unknown`, so an administrator can learn what a row means on a
   * healthy installation and still recognise it on a broken one.
   *
   * ⚑ AND IT REPLACED THE TECHNICAL NOTES RATHER THAN JOINING THEM (operator, 2026-08-21). Those notes
   * said things like "http://gotenberg:3000 — a local sidecar; PDF conversion needs no internet" and
   * "relaxed CSRF and non-Secure cookies" — accurate, and meaningless to the person reading this
   * screen. `detail` now survives on exactly one row, the backup, where the *specifics* are the point:
   * which kind of backup, how big, and where it went.
   */
  description?: string
  detail?: string
}

/**
 * Bounded so a hung sidecar cannot hold the Manage page open.
 *
 * ⚑ 1s, chosen from measurement rather than instinct. A healthy sidecar answers `/health` in 2–4ms, a
 * stopped container refuses in ~34ms and an unresolvable host fails in ~6ms — so every ordinary
 * failure is far inside this. The case the cap exists for is the wedged-but-listening sidecar, which
 * burns the whole budget and becomes the tail latency of a page whose whole Manage render is otherwise
 * ~170ms. 1s keeps ~300x headroom over healthy and halves that worst case. The number appears in the
 * user-visible detail below, so it moves with this constant.
 */
const PROBE_TIMEOUT_MS = 1_000
const BACKUP_STATUS_FILE = '/var/run/lesson3-ops/backup-status.json'
const MAX_BACKUP_STATUS_BYTES = 4_096

const BACKUP_STREAMS = ['daily', 'weekly', 'monthly', 'premigrate'] as const
type BackupStream = (typeof BACKUP_STREAMS)[number]

interface BackupStatusV1 {
  version: 1
  completedAt: string
  stream: BackupStream
  destination: string
  filename: string
  encryptedBytes: number
}

const isNonEmptyBounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/**
 * ⚑ THREE TIMESTAMP CHECKS, THREE DIFFERENT CLASSES — do not "simplify" this to one. Measured:
 *   - `2026-08-21T10:00:00.500Z` / `…+00:00` — the REGEX is the only thing that rejects a shape the
 *     writer never emits (`date -u +%Y-%m-%dT%H:%M:%SZ`), and shape drift is how a contract rots.
 *   - `2026-02-30T10:00:00Z` — parses fine and is NOT NaN; JavaScript rolls it to March 2. Only the
 *     round-trip comparison notices, and "a backup completed on Feb 30" is exactly the kind of false
 *     record this whole file exists to refuse.
 *   - `2026-13-45T99:99:99Z` — passes the regex, IS NaN, and makes `toISOString()` throw `RangeError`.
 *     The NaN guard is what keeps that a `false` here instead of an exception thrown from inside a type
 *     predicate for `decodeCachedJson`'s `catch` to swallow. Correct either way, but a guard whose
 *     safety depends on a foreign try/catch is a trap for whoever edits either side.
 */
const isBackupStatusV1 = (value: unknown): value is BackupStatusV1 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Partial<BackupStatusV1>
  if (record.version !== 1) return false
  if (!isNonEmptyBounded(record.completedAt, 64)) return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.completedAt)) return false
  const completedAt = new Date(record.completedAt)
  if (Number.isNaN(completedAt.getTime())) return false
  if (completedAt.toISOString() !== record.completedAt.replace('Z', '.000Z')) return false
  return (
    BACKUP_STREAMS.includes(record.stream as BackupStream) &&
    isNonEmptyBounded(record.destination, 1_024) &&
    isNonEmptyBounded(record.filename, 512) &&
    Number.isSafeInteger(record.encryptedBytes) &&
    (record.encryptedBytes ?? 0) > 0
  )
}

const backupStreamLabel = (stream: BackupStream): string =>
  ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', premigrate: 'Premigration' })[stream]

/**
 * Where backups GO, as opposed to whether one has happened — and they are genuinely different questions.
 *
 * ⚑ THIS ROW EXISTS BECAUSE THE DESTINATION USED TO APPEAR ONLY AFTER A SUCCESS (operator, 2026-08-22).
 * Until then the panel said "No successful backup recorded" and nothing about where a backup *would*
 * land, which is precisely what an offline school needs while setting a USB drive up. That is a setup
 * question; "did one happen?" is an operations question.
 *
 * ⚑ AND IT IS REPORTED, NOT CHOSEN. A dropdown offering cloud/removable would be a switch that lies:
 * selecting a drive cannot work until somebody has physically mounted it at that path and put the
 * sentinel file on it, and the app can neither do that nor write `.env`. It would look live and produce
 * refusing backups — the exact failure D1 forbids.
 *
 * ⚑ THERE IS NO "SAME DISK" OPTION, DELIBERATELY. `backup-db.sh` refuses a destination backed by the
 * root filesystem ("not a separate volume"), because backing up to the disk you are protecting against
 * is not a backup. So the honest choice is two-way, not three.
 */
function backupDestinationFact(): SystemFact {
  const destination = process.env.BACKUP_RCLONE_REMOTE?.trim()
  const base: Omit<SystemFact, 'value' | 'status'> = {
    key: 'backupDestination',
    label: 'Backup destination',
    envVar: 'BACKUP_RCLONE_REMOTE',
    description:
      'Where encrypted copies of the database are sent — a cloud location, or a removable drive for ' +
      'an installation with no internet. It has to be a separate drive: sending backups to the ' +
      "server's own disk is refused, because that is not a backup.",
  }
  if (!destination) {
    return {
      ...base,
      value: 'Not set',
      // `off` rather than `unknown`: we asked and we know. The detail carries the consequence, since
      // "not configured" is a legitimate state for most rows here and emphatically is not for this one.
      status: 'off',
      detail: 'No backups can run until this is set. Nothing is being copied off this machine.',
    }
  }
  return {
    ...base,
    // ⚑ THE PREDICATE, NOT A STRING COMPARISON AGAINST `destinationLabel`'s PROSE. This read
    // `destinationLabel(destination) === 'a removable backup drive'`, which coupled a branch to display
    // copy: reword that sentence — exactly the kind of edit this file keeps getting — and every
    // removable drive would silently report as a cloud location, with no type error to catch it.
    value: isRemovableDestination(destination) ? 'A removable drive' : 'A cloud location',
    status: 'ok',
    detail: destination,
  }
}

/**
 * ⚑ THE FILESYSTEM GETS A DEADLINE, exactly like the network probe. This reads a bind mount of a host
 * directory, and `collectSystemFacts` joins every fact with one `Promise.all` — so a wedged mount with
 * no bound would not degrade this row, it would hang the whole Manage page for the Site Administrator
 * who most likely opened it BECAUSE something was already broken. Same budget as `probePdfEngine`.
 *
 * Failure and timeout both collapse to `null` on purpose: the operator's next step is identical, which
 * is the argument `probePdfEngine` already makes about unreachable-vs-timed-out. Collapsing here also
 * means the losing promise's rejection is handled rather than becoming an unhandled rejection, and its
 * own `finally` still closes the handle.
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
 * synthetic file can stat as 0 and still stream. Two enforcement points, one limit, distinct reasons.
 */
async function readBackupStatus(): Promise<BackupStatusV1 | null> {
  const file = await open(BACKUP_STATUS_FILE, 'r')
  try {
    const metadata = await file.stat()
    if (!metadata.isFile() || metadata.size > MAX_BACKUP_STATUS_BYTES) return null
    const bytes = await file.readFile()
    if (bytes.byteLength > MAX_BACKUP_STATUS_BYTES) return null
    // The shared decoder owns "untrusted JSON + a runtime contract, else null" for the artifact caches
    // too, so a future hardening of it reaches this reader instead of stopping at a second copy.
    return decodeCachedJson(bytes, isBackupStatusV1)
  } finally {
    await file.close()
  }
}

/**
 * The host backup script is the sole writer; the app receives its directory read-only. Absence and a
 * malformed record are both `unknown`, never `off`: neither proves that no backup exists remotely.
 *
 * ⚑ AND `unknown` IS THE ORDINARY CASE ON A HEALTHY BOX THAT HAS NEVER RUN THE SCRIPT, so the detail
 * names the two things that actually produce a record — rather than the env var, which cannot.
 */
async function readBackupFact(): Promise<SystemFact> {
  const base: Omit<SystemFact, 'value' | 'status'> = {
    key: 'backup',
    label: 'Most recent successful backup',
    envVar: 'BACKUP_RCLONE_REMOTE',
    /**
     * ⚑ "SAFELY" IS GONE, and its removal is the whole point of this row's honesty. A successful
     * upload is not a restorable backup: the record says the encrypted file left the machine, not that
     * it decrypts or that Postgres will accept it. Only the restore drill in `docs/OPS.md` shows that,
     * and "safely" quietly promised it (review, 2026-08-21).
     */
    description:
      'The most recent time an encrypted copy of the database was successfully sent to the ' +
      'configured backup location.',
  }
  const fact = (status: FactStatus, value: string, detail?: string): SystemFact => ({
    ...base,
    value,
    status,
    detail,
  })

  const status = await withDeadline(readBackupStatus(), PROBE_TIMEOUT_MS)
  if (!status) {
    return fact(
      'unknown',
      'No successful backup recorded',
      'No backup has reported success on this machine yet — check that the nightly backup is set up.',
    )
  }
  return fact(
    'ok',
    status.completedAt.replace('T', ' ').replace('Z', ' UTC'),
    // ⚑ THE FILENAME IS GONE from this line (operator review, 2026-08-21): it is opaque on screen and
    // `scripts/restore-db.sh --list` is where you go when you actually need it. What an administrator
    // wants here is which kind of backup, where it went, and that it is not empty.
    `${backupStreamLabel(status.stream)} backup, ${mb(status.encryptedBytes)}, sent to ` +
      `${destinationLabel(status.destination)} (${status.destination}).`,
  )
}

/**
 * Is the PDF sidecar answering?
 *
 * ⚑ THE ONE FACT THAT NEEDS A NETWORK CALL, and the one most worth having: SPEC §9 records the sidecar
 * as a single point of failure — if it is down, every PDF path throws `PdfConversionError`, and the
 * queued path's retries just fail more slowly. Gotenberg's own `/health` route is the probe.
 *
 * ⚑ It is `http://gotenberg:3000` on the compose network — a LOCAL sidecar, not a cloud API. It is the
 * component people reliably assume needs internet, which is why the detail line says so.
 */
async function probePdfEngine(): Promise<SystemFact> {
  // `gotenbergUrl` comes from `docxToPdf` — the module that owns the engine — so the probe and the
  // exporter can never disagree about which host they mean.
  const url = gotenbergUrl()
  const base: Omit<SystemFact, 'value' | 'status'> = {
    key: 'pdfEngine',
    // Renamed from "PDF engine" (operator, 2026-08-21). "Engine" names a component; "capability"
    // says what an administrator loses when the row is not green.
    label: 'PDF previews and downloads',
    envVar: 'GOTENBERG_URL',
    /**
     * ⚑ NO "while it is not answering" CLAUSE. The description is state-independent, so a consequence
     * written into it was shown to an administrator whose row said "Working" (review, 2026-08-21). The
     * consequence now rides on `detail`, which only the failing states set.
     */
    description:
      'Creates PDF copies of lesson plans. This service runs on the ARES Lesson Plans server and ' +
      'does not require internet access.',
  }
  const fact = (status: FactStatus, value: string, detail?: string): SystemFact => ({
    ...base,
    value,
    status,
    detail,
  })
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    // ⚑ NO URL, NO "SIDECAR", NO MILLISECONDS. This row's note used to read
    // "http://gotenberg:3000 — a local sidecar; PDF conversion needs no internet", which the operator
    // rightly called meaningless to anyone running a school. The address is what `GOTENBERG_URL`
    // beside the row already says; the fact that it is local is in the description.
    return res.ok
      ? fact('ok', 'Working')
      : fact(
          'unknown',
          'Problem detected',
          'PDF previews and downloads will not work until this is fixed.',
        )
  } catch {
    // Unreachable OR timed out — indistinguishable from here, and the operator's next step is the
    // same either way, so do not pretend to tell them apart.
    return fact(
      'unknown',
      'Unavailable',
      'PDF previews and downloads will not work until this is fixed.',
    )
  }
}

/**
 * Artifact-cache usage.
 *
 * ⚑ WHY A CAPACITY NUMBER AND NOT A TUNING KNOB (SPEC §9): official versions are pre-warmed into this
 * cache, so a public download should be a cache HIT rather than a conversion. Once the cache thrashes,
 * a cheap path silently becomes an expensive one with no code change — so "used vs max" is the fact
 * that tells an operator whether that is about to happen.
 */
async function probeArtifactCache(): Promise<SystemFact> {
  // ⚑ BOTH FIGURES COME FROM THE CACHE MODULE, not from a second env read. It owns the ceiling
  // eviction enforces and what counts toward it; re-deriving either here let the panel report a
  // ceiling the evictor does not use, and `positiveIntEnv` would also have thrown from OUTSIDE the
  // try below, breaking this module's never-throws contract.
  const max = artifactCacheMaxBytes()
  const dir = artifactCacheDir()
  const base: Omit<SystemFact, 'value' | 'status'> = {
    key: 'artifactCache',
    // Renamed from "Artifact cache" (operator, 2026-08-21) — "artifact" is build jargon.
    label: 'Temporary document storage',
    envVar: 'ARTIFACT_CACHE_MAX_BYTES',
    description:
      'Keeps temporary copies of generated Word and PDF files so repeat downloads are faster. These ' +
      'copies can be recreated and are not backups.',
  }
  try {
    // `.bin` only, matching `evictIfNeeded`'s own definition of "used" — an in-flight `.tmp` write
    // counts toward neither the cap nor this figure.
    const names = (await readdir(dir)).filter(isArtifactCacheEntry)
    // ⚑ IN PARALLEL, like `evictIfNeeded` — which totals the same file set in the same directory and
    // has always done it this way. Measured: an await-in-loop is 4.5–5.4x slower (601ms vs 112ms at
    // 20k entries), and the entry count is much higher than "a DOCX and a PDF per official version"
    // because `htmlSectionsCache` and `htmlDiffCache` share this directory and diff entries are per
    // version-PAIR. At a full 512MB cache that is ~105ms against a ~170ms budget for the whole Manage
    // render — and it degrades as the cache fills, i.e. exactly when this row matters.
    const sizes = await Promise.all(
      names.map(async (name) => {
        // One failed stat (a file swept between readdir and stat) must not lose the whole figure.
        try {
          return (await stat(join(dir, name))).size
        } catch {
          return 0 // raced with a cache eviction
        }
      }),
    )
    const used = sizes.reduce((sum, n) => sum + n, 0)
    return {
      ...base,
      value: `${mb(used)} used of ${mb(max)}`,
      status: 'ok',
      // ⚑ NO BARE DIRECTORY PATH. This was `detail: dir` — `/var/cache/lesson3` with no label, which
      // is the same unreadable class as the PDF row's container URL (operator, 2026-08-21). The
      // description says what this is; whoever needs the path has `ARTIFACT_CACHE_DIR`.
    }
  } catch {
    return { ...base, value: 'Cannot be checked', status: 'unknown' }
  }
}

/**
 * ⚑ WHOLE MEGABYTES, AND "MB" WITH A 1024-BASED DIVISOR. Nobody reading this screen cares about exact
 * sizes (operator, 2026-08-21), so there is no decimal place and no unit negotiation: the cap is
 * 536,870,912 bytes, which every operating system displays as "512 MB", and a row reading "512 MiB"
 * invites "is that the 512 I configured?". Strictly these are mebibytes wearing the familiar label,
 * which is the right trade for a figure whose only job is "roughly how full is it".
 *
 * The one guard is the floor: rounding alone would print "0 MB" for a small backup, which reads as a
 * fault rather than as a small number.
 */
const mb = (bytes: number): string => {
  const value = Math.round(bytes / 1_048_576)
  return value < 1 ? 'under 1 MB' : `${value} MB`
}

/**
 * ⚑ WE CANNOT SAY "GOOGLE DRIVE", AND SAYING IT WOULD BE A GUESS. `BACKUP_RCLONE_REMOTE` is either an
 * absolute path (which `backup-db.sh` requires to be a separate, sentinel-marked mount — so a genuine
 * removable drive) or an `rclone` remote in `nickname:path` form. That nickname is chosen by whoever
 * configured rclone: `drive:` is conventional for Google Drive because rclone's own documentation uses
 * it, but the same remote could be Dropbox or S3. So the two cases we can tell apart honestly are
 * removable-vs-cloud, and the raw value travels alongside for anyone who needs it.
 */
const isRemovableDestination = (destination: string): boolean => destination.startsWith('/')

const destinationLabel = (destination: string): string =>
  isRemovableDestination(destination) ? 'a removable backup drive' : 'a cloud backup location'

/**
 * Every fact, in the order the panel shows them: identity first, then the capabilities an operator
 * asks about when something is not working.
 *
 * The two probes and the recorded backup read run concurrently — they are independent, and the
 * network one is normally the slow one.
 */
export async function collectSystemFacts(): Promise<SystemFact[]> {
  const [pdfEngine, artifactCache, backup] = await Promise.all([
    probePdfEngine(),
    probeArtifactCache(),
    readBackupFact(),
  ])

  const serverUrl = process.env.SERVER_URL?.trim()
  const publicLibrary = isPublicLibraryEnabled()
  const smtpHost = process.env.SMTP_HOST
  const errorTracking = errorTrackingEnabled()

  return [
    {
      key: 'serverUrl',
      // Renamed from "Base URL" (operator, 2026-08-21): an administrator does not necessarily know
      // what a "base URL" is, and this row is the one most likely to be wrong on a fresh install.
      label: 'Web address',
      /**
       * ⚑ NOT "Public web address" (reviewed 2026-08-21). A school server on its own network is a
       * legitimate installation — that is why unset reads `off` rather than `unknown` — and calling
       * the row "public" contradicts the very case the next line exists to reassure.
       *
       * ⚑ AND "must match" IS CONDITIONAL. Unqualified it read as though unset were a fault.
       */
      description:
        'The main internet address people use to open ARES Lesson Plans. On an internet-facing ' +
        'installation it must match the address people actually visit.',
      value: serverUrl || 'Not set — suitable for a local installation',
      status: serverUrl ? 'ok' : 'off',
      envVar: 'SERVER_URL',
    },
    {
      key: 'publicLibrary',
      label: 'Public lesson library',
      /**
       * ⚑ THE SECOND SENTENCE IS NOT "a separate switch decides whether it currently does", which is
       * what the chosen wording said. That switch is not built yet, so it would send an administrator
       * hunting for a control that is not on the screen. This phrasing is true today AND stays true
       * after the switch lands.
       */
      description:
        'Whether this installation can make selected lessons available without signing in. This ' +
        'setting does not publish any lesson by itself.',
      value: publicLibrary ? 'Available' : 'Not available',
      status: publicLibrary ? 'ok' : 'off',
      envVar: 'PUBLIC_LIBRARY_ENABLED',
    },
    {
      key: 'email',
      label: 'Email service',
      /**
       * ⚑ "NOBODY CAN RECOVER A FORGOTTEN PASSWORD" WAS FALSE, and false in exactly the deployment
       * this panel serves. `endpoints/userAdminActions.ts` has `reveal-reset-link` (D5), which mints a
       * reset link and returns it once — its docblock says outright that it exists "to make that
       * existing authority usable in a deployment with no reliable email". An offline school reading
       * the old sentence would have concluded it was locked out of its own accounts.
       */
      description:
        'Sends account-confirmation and password-reset emails, notifications, and lesson documents.',
      value: smtpHost ? 'Ready' : 'Not set up',
      status: smtpHost ? 'ok' : 'off',
      envVar: 'SMTP_HOST',
      detail: smtpHost
        ? undefined
        : 'Automatic emails cannot be sent. A Site Administrator can still create a password-reset ' +
          'link and hand it to the person directly.',
    },
    {
      key: 'errorTracking',
      label: 'Automatic problem reports',
      /**
       * ⚑ THIS ANSWERS "REPORTED WHERE?", which the operator asked and the old wording dodged. The
       * destination is whatever `SENTRY_DSN` names; the chosen backend is a SELF-HOSTED GlitchTip
       * (decision 2026-07-05) speaking the Sentry protocol — so by default nothing goes to a third
       * party. And `lib/errorTracking.ts` sends route/job context only, never headers or bodies, so
       * no cookies, passwords or form contents travel with a report. Both facts belong on the screen:
       * "we send crash reports somewhere" is exactly the sentence that worries a school.
       */
      description:
        'Sends technical information about unexpected errors to the monitoring service so problems ' +
        'can be found sooner. Request headers and form contents are not attached.',
      value: errorTracking ? 'On' : 'Off',
      status: errorTracking ? 'ok' : 'off',
      envVar: 'SENTRY_DSN',
    },
    backupDestinationFact(),
    backup,
    pdfEngine,
    artifactCache,
  ]
}
