/**
 * Env template ↔ code parity guard (reverses the Codex #5 "`.env.example` sync" deferral).
 *
 * WHY THIS EXISTS, and why it is a TEST rather than a one-time tidy-up: the drift was already found
 * once (Codex 2026-07-06, item #5) and deliberately parked on the deferred backlog
 * (`docs/NEXT-SESSION.md`, `docs/DECISIONS.md`). Parking it is what produced the state this test was
 * written against: the root template — the file a Compose operator copies — declared 5 of the 58
 * variables the app actually reads. The missing ones included `ARTIFACT_CACHE_DIR`, which is not
 * cosmetic: unset, the artifact cache falls back to `/app/.artifact-cache`, the non-root container
 * cannot write it, and EVERY export job fails with `EACCES` while the client polls a `202` forever.
 * A fresh, correctly-followed install was therefore broken on arrival. A second manual reconciliation
 * would rot the same way, so the sync is now mechanical.
 *
 * THE CONTRACT (each assertion below maps to a real observed failure):
 *   A. every config variable the app reads is declared in the ROOT template  → the ARTIFACT_CACHE_DIR bug
 *   B. every variable declared in ROOT is read by the app, or is Compose-only → stale//invented entries
 *   C. the APP template contains only app-read variables, and all dev-critical ones → it was a
 *      copy of the root file, carrying Compose-only `POSTGRES_PASSWORD` and a `postgres:5432` DB host
 *   D. the deliberate security escape hatch appears in NEITHER template        → see below
 *   E. each template's `DATABASE_URI` has the host shape ITS consumer needs   → the AGENTS.md §Local
 *      stack requirement that host-local dev points at 127.0.0.1:55432
 *   F. every `process.env` access in the source matches a shape this test KNOWS how to read
 *
 * F IS THE LOAD-BEARING ONE. A parity checker that silently fails to see some reads is worse than no
 * checker, because it certifies a completeness it never verified — the same false-authority failure as
 * a docstring that describes behaviour the code does not have. A naive `process.env.X` scan misses
 * every `RATE_LIMIT_*` value, since those are read through `positiveIntEnv('NAME', default)`
 * (`src/lib/rateLimit.ts`) — i.e. most of the rate-limit surface, which is security configuration. So
 * an unrecognised access shape FAILS and asks to be taught, rather than being skipped.
 *
 * Deliberately DB-free and Payload-free (pure fs + regex) → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const APP_DIR = join(__dirname, '..', '..')
const REPO_DIR = join(APP_DIR, '..')
const ROOT_TEMPLATE = join(REPO_DIR, '.env.example')
const APP_TEMPLATE = join(APP_DIR, '.env.example')

/**
 * Set by the framework/runtime, never by an operator: Next.js sets `NEXT_PHASE`/`NEXT_RUNTIME`
 * itself, and `RENDER_TIMINGS` is a local perf-probe flag (`lib/renderTimings.ts`) that is meant to
 * be passed ad hoc for one run, not carried in a deployment's config.
 */
const RUNTIME_PROVIDED = new Set(['NEXT_PHASE', 'NEXT_RUNTIME', 'RENDER_TIMINGS'])

/**
 * Read by Compose or the container, not by `app/src` — so they belong in the ROOT template only and
 * must not be flagged as stale there. `NODE_ENV`/`PORT` are also set by the Dockerfile; keeping them
 * in the root file documents the container's contract.
 */
const COMPOSE_ONLY = new Set(['POSTGRES_PASSWORD', 'GOTENBERG_TREE', 'NODE_ENV', 'PORT'])

/**
 * MUST NOT appear in any template. `ALLOW_FIRST_USER_BOOTSTRAP=1` disables the empty-users boot
 * refusal that stops Payload's unauthenticated first-register from handing Site Admin to the first
 * visitor (`lib/publicPosture.ts`, verified live 2026-07-05). It is a one-boot escape hatch whose
 * whole safety rests on being typed deliberately; a commented-out line in a template someone
 * uncomments "to get past the error" is the exact failure mode. Documented in `docs/OPS.md` instead.
 */
const NEVER_IN_TEMPLATE = new Set(['ALLOW_FIRST_USER_BOOTSTRAP'])

/** Without these four, a host-local `next dev` run is misconfigured rather than merely untuned. */
const DEV_CRITICAL = ['DATABASE_URI', 'PAYLOAD_SECRET', 'ADMIN_URL', 'SERVER_URL']

/**
 * Env-reading shapes this checker understands.
 *
 * `HELPER_NAMES` must equal the exports of `src/lib/env.ts` — assertion G pins that, because a NEW
 * helper added there would otherwise read env through a shape this file has never heard of, inside
 * the one module whose dynamic access is tolerated. That is a false-coverage hole, not a gap in
 * strictness: F would still pass while the variable went unverified.
 */
const HELPER_NAMES = ['positiveIntEnv']

/**
 * Both helper patterns are BUILT from `HELPER_NAMES`, never maintained beside it. Hand-kept copies
 * would let someone satisfy G by adding a name while the regexes stayed unchanged — so G would certify
 * a helper whose calls remain invisible, which is worse than not checking at all. One list, two
 * derived patterns, no way to update half of it.
 */
const helperAlternation = HELPER_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
const DIRECT_READ = /process\.env\.([A-Z][A-Z0-9_]*)/g
const BRACKET_READ = /process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g
/** A helper call whose variable name is a LITERAL — the only form whose variable is knowable here. */
const HELPER_READ = new RegExp(`\\b(?:${helperAlternation})\\s*\\(\\s*['"]([A-Z][A-Z0-9_]*)['"]`, 'g')
/** EVERY helper call, literal-named or not. The difference is what assertion F reports. */
const HELPER_CALL = new RegExp(`\\b(?:${helperAlternation})\\s*\\(`, 'g')

/**
 * The env module's export surface is restricted POSITIVELY: every `export` in it must be a direct
 * `const` / `function` declaration whose name this scan can read. An earlier version blacklisted
 * `export {`, `export *` and `export default` — which still let `export async function`, `export let`,
 * `export class` and `export enum` through unnamed, so G would have claimed a surface it had not read.
 * Enumerating what is allowed cannot have that hole; enumerating what is forbidden always can.
 */
const PERMITTED_EXPORT = /^export\s+(?:const|(?:async\s+)?function)\s+([A-Za-z_$][\w$]*)/
const ANY_EXPORT_LINE = /^export\b.*$/gm

/**
 * Imports of the env helpers must be plain, unaliased named imports. `import { positiveIntEnv as
 * readInt }` followed by `readInt('RATE_LIMIT_X', 1)` is invisible to a name-based matcher, and so is
 * `import * as env` + `env.positiveIntEnv(…)`. Rejecting both forms is a two-line contract; resolving
 * aliases properly would mean parsing the module graph. Today every one of the six call sites already
 * imports it plainly, so this costs nothing and closes the bypass.
 */
const IMPORT_STATEMENT = /^import\s+([\s\S]+?)\s+from\s+['"]([^'"]+)['"]/gm
const IS_ENV_MODULE = /(^|\/)(lib\/)?env$/
/** Every `process.env` occurrence, so unrecognised ones can be counted against the recognised. */
const ANY_ENV_TOUCH = /process\.env/g

/**
 * Budgeted dynamic access: `positiveIntEnv`'s own implementation reads `process.env[name]` from a
 * parameter, which is legitimate and unavoidable. Budgeted by COUNT rather than allowlisted by file,
 * so a SECOND dynamic read added to the same module still trips F — a whole-file exemption would let
 * `src/lib/env.ts` become a blind spot precisely because it is the env module.
 */
const DYNAMIC_READ_BUDGET = new Map([['src/lib/env.ts', 1]])

/**
 * `.js` is included deliberately: `allowJs` is on and `app/src` already contains five `.js` files
 * (the byte-pristine vendored ARES generator, plus Payload's generated importMap). None reads env
 * today — and if one ever does, it must be visible here rather than silently unscanned. Nothing about
 * this test edits those files; it only reads them.
 */
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

const sourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '.next') sourceFiles(full, acc)
    } else if (SOURCE_EXT.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const ENV_MODULE = join(APP_DIR, 'src', 'lib', 'env.ts')

/**
 * The env module's exports, and any export line this scan could not read. Both come from the SAME
 * pattern, so a form the scan cannot name is necessarily reported rather than silently skipped.
 */
const envModuleSurface = (): { names: string[]; unreadable: string[] } => {
  const text = readFileSync(ENV_MODULE, 'utf8')
  const names: string[] = []
  const unreadable: string[] = []
  for (const [line] of text.matchAll(ANY_EXPORT_LINE)) {
    const m = PERMITTED_EXPORT.exec(line)
    if (m) names.push(m[1])
    else unreadable.push(line.trim())
  }
  return { names: names.sort(), unreadable }
}

/** Import clauses that would hide an env-helper call from the name-based matcher. */
const aliasedEnvImports = (files: string[]): string[] => {
  const offenders: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [, clause, specifier] of text.matchAll(IMPORT_STATEMENT)) {
      if (!IS_ENV_MODULE.test(specifier)) continue
      const namespaced = clause.trim().startsWith('*')
      const renamed = /\{[^}]*\bas\b[^}]*\}/.test(clause)
      if (namespaced || renamed) {
        offenders.push(`${relative(APP_DIR, file)}: ${clause.replace(/\s+/g, ' ').trim()}`)
      }
    }
  }
  return offenders
}

const matchAll = (text: string, re: RegExp): string[] =>
  [...text.matchAll(new RegExp(re.source, re.flags))].map((m) => m[1])

const countOf = (text: string, re: RegExp): number =>
  [...text.matchAll(new RegExp(re.source, re.flags))].length

/** Declared assignments in a `.env` template: `NAME=` at line start (commented lines excluded). */
const declaredIn = (path: string): Set<string> => {
  const out = new Set<string>()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    if (m) out.add(m[1])
  }
  return out
}

/** Every variable `app/src` (plus next.config.ts) reads, by any recognised shape. */
const collectReads = (): { reads: Set<string>; unrecognised: string[]; aliased: string[] } => {
  const reads = new Set<string>()
  const unrecognised: string[] = []
  const files = [...sourceFiles(join(APP_DIR, 'src')), join(APP_DIR, 'next.config.ts')]
  const aliased = aliasedEnvImports(files)

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(APP_DIR, file)
    const direct = matchAll(text, DIRECT_READ)
    const bracket = matchAll(text, BRACKET_READ)
    const helperLiteral = matchAll(text, HELPER_READ)
    for (const name of [...direct, ...bracket, ...helperLiteral]) reads.add(name)

    // F1: every `process.env` touch must be accounted for by a recognised shape, and each module's
    // dynamic budget must be consumed EXACTLY. Not `> budget`: if the one legitimate dynamic read in
    // `lib/env.ts` were ever removed or rewritten, a `>` test would pass with an unused allowance
    // sitting there, ready to hide the next dynamic read added to that file. An allowance nobody
    // spends is a hole, so it must be spent or deleted.
    const touches = countOf(text, ANY_ENV_TOUCH)
    const budget = DYNAMIC_READ_BUDGET.get(rel) ?? 0
    const dynamicUsed = touches - (direct.length + bracket.length)
    if (dynamicUsed !== budget) {
      unrecognised.push(
        `${rel}: ${dynamicUsed} dynamic process.env access(es), budget is exactly ${budget}`,
      )
    }

    // F2: every helper CALL must name its variable literally. A dynamic call — `positiveIntEnv(name,
    // …)` — contains no `process.env` at the call site, so F1 cannot see it: the variable would be
    // read at runtime and silently absent from the templates. Requiring a literal keeps every
    // variable statically knowable, which is the only basis on which this test can claim coverage.
    const dynamicHelperCalls = countOf(text, HELPER_CALL) - helperLiteral.length
    if (dynamicHelperCalls > 0) {
      unrecognised.push(
        `${rel}: ${dynamicHelperCalls} env-helper call(s) without a literal variable name`,
      )
    }
  }
  return { reads, unrecognised, aliased }
}

describe('env template parity', () => {
  const { reads, unrecognised, aliased } = collectReads()
  const root = declaredIn(ROOT_TEMPLATE)
  const app = declaredIn(APP_TEMPLATE)

  /** App-read variables an operator is expected to configure. */
  const configurable = [...reads]
    .filter((n) => !RUNTIME_PROVIDED.has(n) && !NEVER_IN_TEMPLATE.has(n))
    .sort()

  it('F: every env read uses a shape this checker recognises, with a literal variable name', () => {
    // If this fails, TEACH THE CHECKER (add the shape above) — do not delete the assertion. A read it
    // cannot see is a variable it cannot verify, and silence here would be a false all-clear.
    expect(unrecognised).toEqual([])
  })

  it('G: lib/env.ts exports exactly the helpers this checker knows how to read', () => {
    // A new helper in the env module would read env through an unrecognised shape, inside the one
    // module whose dynamic access is budgeted — so F would keep passing while its variable went
    // unverified. Registering it in HELPER_NAMES is now sufficient: both helper patterns are DERIVED
    // from that list, so a name cannot be added without its calls becoming visible.
    const { names, unreadable } = envModuleSurface()
    // Every export must be a form this scan can NAME. Reported first: an unreadable export makes the
    // name comparison below meaningless, so it is the more informative failure.
    expect(unreadable, 'lib/env.ts must use only `export const` / `export [async] function`').toEqual(
      [],
    )
    expect(names).toEqual([...HELPER_NAMES].sort())
  })

  it('H: env helpers are imported plainly, so their call sites stay matchable', () => {
    // `import { positiveIntEnv as readInt }` + `readInt('RATE_LIMIT_X', 1)`, or `import * as env` +
    // `env.positiveIntEnv(…)`, are both invisible to a name-based matcher — the variable would be read
    // at runtime and absent from every template, with F none the wiser.
    expect(aliased).toEqual([])
  })

  it('A: the root template declares every configurable variable the app reads', () => {
    expect(configurable.filter((n) => !root.has(n))).toEqual([])
  })

  it('B: the root template declares nothing the app does not read', () => {
    const stale = [...root].filter((n) => !reads.has(n) && !COMPOSE_ONLY.has(n)).sort()
    expect(stale).toEqual([])
  })

  it('C: the app template is host-local dev config only, and covers the dev-critical vars', () => {
    // It was a verbatim copy of the root file, so it carried Compose-only vars that mean nothing to a
    // host-local `next dev` run (notably POSTGRES_PASSWORD).
    expect([...app].filter((n) => !reads.has(n)).sort()).toEqual([])
    expect(DEV_CRITICAL.filter((n) => !app.has(n))).toEqual([])
  })

  it('D: the first-user bootstrap escape hatch is in neither template', () => {
    for (const name of NEVER_IN_TEMPLATE) {
      expect(root.has(name), `${name} must not be in the root template`).toBe(false)
      expect(app.has(name), `${name} must not be in the app template`).toBe(false)
    }
  })

  it('E: each template points DATABASE_URI at the host ITS consumer must use', () => {
    const uriIn = (path: string): string =>
      readFileSync(path, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('DATABASE_URI=')) ?? ''

    // Containers reach Postgres by compose service name over the internal network...
    expect(uriIn(ROOT_TEMPLATE)).toContain('@postgres:5432/')
    // ...while host-local dev must use the port docker-compose.local.yml publishes (AGENTS.md).
    expect(uriIn(APP_TEMPLATE)).toMatch(/@(127\.0\.0\.1|localhost):55432\//)
  })
})
