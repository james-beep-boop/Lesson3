import { readdir, stat } from 'fs/promises'
import { join } from 'path'

import {
  artifactCacheDir,
  artifactCacheMaxBytes,
  isArtifactCacheEntry,
} from '../generator/artifactCache'
import { gotenbergUrl } from '../generator/docxToPdf'
import { errorTrackingEnabled } from './errorTracking'
import { isPublicLibraryEnabled } from './publicLibrary'

/**
 * The read-only half of Manage → System: what this installation IS, as opposed to what is switched on.
 *
 * ⚑ REPORTED PER REQUEST, NEVER OPERATOR-AUTHORED HERE. Every row is computed from the environment or
 * a live probe. Design: `docs/DESIGN-system-panel-2026-08-21.md`. The backup rows that used to live
 * here moved to their own panel, Manage → System → Backups (`lib/backupStatus.ts`, design A5), when
 * one "most recent backup" row became several statements.
 *
 * ⚑ AND EVERY FACT NAMES ITS ENV VAR, because these are the settings that CANNOT be runtime-switched
 * and the panel must look like it. D1 is blunt about this: "A toggle that silently does nothing until
 * restart is worse than no toggle; this is the half that cannot be runtime-switched, and it must look
 * like it." `SERVER_URL` drives the CSRF allowlist and Secure cookies at boot; SMTP, error tracking and
 * the PDF engine are wired at startup. Naming the variable is what turns "email: off" from a mystery
 * into an instruction.
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
  /** The environment variable that decides it, named so the operator knows where to go. */
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
   * screen. `detail` now carries only state-specific consequences.
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
export const mb = (bytes: number): string => {
  const value = Math.round(bytes / 1_048_576)
  return value < 1 ? 'under 1 MB' : `${value} MB`
}

/**
 * Every fact, in the order the panel shows them: identity first, then the capabilities an operator
 * asks about when something is not working.
 *
 * The two probes run concurrently — they are independent, and the network one is normally the slow
 * one.
 */
export async function collectSystemFacts(): Promise<SystemFact[]> {
  const [pdfEngine, artifactCache] = await Promise.all([probePdfEngine(), probeArtifactCache()])

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
       * destination is whatever `SENTRY_DSN` names. **No backend is chosen and the feature is OFF**
       * (2026-09-01): self-hosted GlitchTip was rejected for sharing a failure domain with the app it
       * watches, and hosted Sentry was deferred as an external data flow that no deployment requires.
       *
       * ⚑ THIS ROW HAS NOW CARRIED TWO FALSE CLAIMS, WHICH IS WHY THE WORDING IS SO CAUTIOUS.
       *
       * The first said self-hosting meant "nothing goes to a third party" — untrue the moment a hosted
       * DSN became possible. The replacement then promised reports contain "never names or email
       * addresses", which is ALSO untrue: only the *context* payloads are ids and route paths
       * (`versionId`, `userId`, `messageId`, `kind`, `path`, `routePath`). The exception's own message
       * and stack are transmitted too, there is no `beforeSend` scrubber, and an SMTP failure in
       * `passwordResetEmail` can plausibly carry a recipient address inside the error text. Verifying
       * the call sites was not the same as verifying what is sent.
       *
       * So the row now claims only what the code guarantees: headers and form contents are never
       * attached, the destination may be outside the school, and the error message itself travels and
       * may quote things. If a stronger promise is ever wanted, it has to be earned with an SDK-side
       * scrubber, not asserted in copy.
       */
      description:
        'Sends technical details of unexpected errors to whichever monitoring service is configured, ' +
        'which may be outside the school. What goes: where in the software the error happened, internal ' +
        'record numbers, and the error message and stack trace themselves — which can quote a filename ' +
        'or an address. ' +
        'Request headers and form contents are never attached.',
      value: errorTracking ? 'On' : 'Off',
      status: errorTracking ? 'ok' : 'off',
      envVar: 'SENTRY_DSN',
    },
    pdfEngine,
    artifactCache,
  ]
}
