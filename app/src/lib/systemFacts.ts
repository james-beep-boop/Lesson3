import { readdir, stat } from 'fs/promises'
import { join } from 'path'

import { artifactCacheDir } from '../generator/artifactCache'
import { errorTrackingEnabled } from './errorTracking'
import { positiveIntEnv } from './env'
import { isPublicLibraryEnabled } from './publicLibrary'

/**
 * The read-only half of Manage → System: what this installation IS, as opposed to what is switched on.
 *
 * ⚑ COMPUTED PER REQUEST, NEVER PERSISTED. A stored fact is a cache of a fact — it goes stale and then
 * lies, on the one screen whose entire purpose is telling an operator what is currently true. Design:
 * `docs/DESIGN-system-panel-2026-08-21.md`.
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
  detail?: string
}

/** Bounded so a hung sidecar cannot hold the Manage page open. */
const PROBE_TIMEOUT_MS = 2_000

const gotenbergUrl = (): string =>
  (process.env.GOTENBERG_URL || 'http://gotenberg:3000').replace(/\/+$/, '')

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
  const base = gotenbergUrl()
  const fact = (status: FactStatus, value: string, detail?: string): SystemFact => ({
    key: 'pdfEngine',
    label: 'PDF engine',
    value,
    status,
    envVar: 'GOTENBERG_URL',
    detail,
  })
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return res.ok
      ? fact('ok', 'Reachable', `${base} — a local sidecar; PDF conversion needs no internet.`)
      : fact('unknown', `Answered ${res.status}`, base)
  } catch {
    // Unreachable OR timed out — indistinguishable from here, and the operator's next step is the
    // same either way, so do not pretend to tell them apart.
    return fact(
      'unknown',
      'Not reachable',
      `${base} did not answer within ${PROBE_TIMEOUT_MS}ms. Every PDF export and preview fails while this is true.`,
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
  const max = positiveIntEnv('ARTIFACT_CACHE_MAX_BYTES', 536_870_912)
  const dir = artifactCacheDir()
  const base: Omit<SystemFact, 'value' | 'status'> = {
    key: 'artifactCache',
    label: 'Artifact cache',
    envVar: 'ARTIFACT_CACHE_MAX_BYTES',
  }
  try {
    const names = await readdir(dir)
    let used = 0
    for (const name of names) {
      // One failed stat (a file swept between readdir and stat) must not lose the whole figure.
      try {
        used += (await stat(join(dir, name))).size
      } catch {
        /* raced with a cache eviction; skip it */
      }
    }
    const pct = max > 0 ? Math.round((used / max) * 100) : 0
    return {
      ...base,
      value: `${mib(used)} of ${mib(max)} (${pct}%), ${names.length} file${names.length === 1 ? '' : 's'}`,
      status: 'ok',
      detail: dir,
    }
  } catch {
    return { ...base, value: 'Not readable', status: 'unknown', detail: dir }
  }
}

const mib = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MiB`

/**
 * Every fact, in the order the panel shows them: identity first, then the capabilities an operator
 * asks about when something is not working.
 *
 * The two probes run concurrently — they are independent, and the network one is the slow one.
 */
export async function collectSystemFacts(): Promise<SystemFact[]> {
  const [pdfEngine, artifactCache] = await Promise.all([probePdfEngine(), probeArtifactCache()])

  const serverUrl = process.env.SERVER_URL?.trim()
  const publicLibrary = isPublicLibraryEnabled()

  return [
    {
      key: 'serverUrl',
      label: 'Base URL',
      value: serverUrl || 'Not set',
      status: serverUrl ? 'ok' : 'off',
      envVar: 'SERVER_URL',
      detail: serverUrl
        ? 'Also drives the CSRF allowlist and Secure cookies. Both are decided at boot.'
        : 'Internal/offline posture: relaxed CSRF and non-Secure cookies, which suits plain-HTTP LAN use.',
    },
    {
      key: 'publicLibrary',
      label: 'Public library capability',
      value: publicLibrary ? 'Permitted by environment' : 'Not permitted',
      status: publicLibrary ? 'ok' : 'off',
      envVar: 'PUBLIC_LIBRARY_ENABLED',
      detail: publicLibrary
        ? 'This deployment MAY serve public routes. Whether it currently does is a runtime flag inside this ceiling.'
        : 'Every public route returns 404 at the server, and no runtime flag can override it.',
    },
    {
      key: 'email',
      label: 'Outbound email',
      value: process.env.SMTP_HOST ? 'Configured' : 'Not configured',
      status: process.env.SMTP_HOST ? 'ok' : 'off',
      envVar: 'SMTP_HOST',
      detail: process.env.SMTP_HOST
        ? undefined
        : 'Password resets, message pings and emailed documents cannot leave this installation.',
    },
    {
      key: 'errorTracking',
      label: 'Error tracking',
      value: errorTrackingEnabled() ? 'Configured' : 'Not configured',
      status: errorTrackingEnabled() ? 'ok' : 'off',
      envVar: 'SENTRY_DSN',
      // ⚑ Not runtime-switchable, and this is exactly why the facts half exists: it is wired in
      // `instrumentation.ts` at boot, so a toggle for it would be a lie.
      detail: 'Wired at startup — changing it needs a restart, not a setting.',
    },
    pdfEngine,
    artifactCache,
  ]
}
