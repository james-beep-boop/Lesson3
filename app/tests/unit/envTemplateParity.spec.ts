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
 * THE CONTRACT (each assertion maps to a real observed failure):
 *   A. every config variable the app reads is declared in the ROOT template  → the ARTIFACT_CACHE_DIR bug
 *   B. every variable declared in ROOT is read by the app, or is Compose-only → stale/invented entries
 *   C. the APP template holds only app-read variables, and all dev-critical ones → it was a copy of the
 *      root file, carrying Compose-only `POSTGRES_PASSWORD` and a `postgres:5432` DB host
 *   D. the deliberate security escape hatch appears in NEITHER template        → see below
 *   E. each template points DATABASE_URI at the host ITS consumer needs        → the AGENTS.md §Local
 *      stack requirement that host-local dev uses 127.0.0.1:55432
 *   F. every env read in the source is one this checker could actually resolve
 *   G. `lib/env.ts` exports exactly the helpers this checker knows how to follow
 *
 * F IS THE LOAD-BEARING ONE, and it is why this file parses the source instead of grepping it. A
 * checker that silently fails to see some reads is worse than none, because it certifies a
 * completeness it never verified — the same false-authority failure as a docstring describing
 * behaviour the code does not have. Three successive regex versions of this file each had that hole:
 * a naive `process.env.X` scan missed every `RATE_LIMIT_*` (they are read through
 * `positiveIntEnv('NAME', default)`); then a name-based matcher missed
 * `import { positiveIntEnv as readInt }`; then rejecting aliased imports still missed
 * `const readInt = positiveIntEnv`, re-exports and dynamic imports. Each fix invited the next bypass,
 * which is the signature of the wrong tool.
 *
 * So reads are collected from the TypeScript AST (`ts.createSourceFile` — parse only, no type checker,
 * so it stays fast and DB-free). Import renames ARE followed, because that is the module system's own
 * aliasing and a normal thing to write. Everything else that puts a helper beyond this parse's reach —
 * a namespace import, a re-export, a dynamic import, or handing the helper around as a value
 * (including `const f = positiveIntEnv`) — is REPORTED by F rather than chased. Reporting is both
 * simpler and stricter than following: the rule this file can honestly enforce is that **an env helper
 * is only ever called directly, by an imported binding, with a literal variable name.**
 *
 * Deliberately DB-free and Payload-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { parse as parseEnvFile } from 'dotenv'
import ts from 'typescript'

import { isLocalDatabaseUri } from '../../scripts/lib/localDbGuard'

const APP_DIR = join(__dirname, '..', '..')

/**
 * The two templates live at the REPO root and inside `app/` respectively — and the repo root is not
 * always the parent of `app/`. CI runs `test:unit` in a container that mounts ONLY `app/`
 * (`.github/workflows/ci.yml`), so `join(APP_DIR, '..')` is `/` there and the root template is absent.
 * That is not hypothetical: the first version of this file assumed the parent directory and would have
 * failed every CI run with a bare `ENOENT` at collection time — no named test, no useful message. CI
 * now mounts the repo read-only and names it here; the parent directory remains the fallback for local
 * runs and for the Rock, where it is correct.
 */
const REPO_DIR = process.env.LESSON3_REPO_ROOT ?? join(APP_DIR, '..')
const ROOT_TEMPLATE = join(REPO_DIR, '.env.example')
const APP_TEMPLATE = join(APP_DIR, '.env.example')
const ENV_MODULE_REL = 'src/lib/env.ts'

/**
 * Set by the framework/runtime, never by an operator: Next.js sets `NEXT_PHASE`/`NEXT_RUNTIME`
 * itself, and `RENDER_TIMINGS` is a local perf-probe flag (`lib/renderTimings.ts`) meant to be passed
 * ad hoc for one run, not carried in a deployment's config.
 */
const RUNTIME_PROVIDED = new Set(['NEXT_PHASE', 'NEXT_RUNTIME', 'RENDER_TIMINGS'])

/**
 * Read by Compose or the container, not by `app/src` — so they belong in the ROOT template only and
 * must not be flagged as stale there. `NODE_ENV`/`PORT` are also set by the Dockerfile; keeping them
 * in the root file documents the container's contract.
 *
 * ⚑ Hand-maintained, unlike the app side. Deriving it from `docker-compose*.yml` `${VAR}` references
 * and the Dockerfile's `ENV` lines would give these four names real coverage — today nothing notices
 * if Compose stops reading one. Tracked as a follow-up rather than done here: it adds coverage rather
 * than simplifying, and wants its own sanity-flips.
 */
const COMPOSE_ONLY = new Set(['POSTGRES_PASSWORD', 'GOTENBERG_TREE', 'NODE_ENV', 'PORT'])

/**
 * MUST NOT appear in any template. `ALLOW_FIRST_USER_BOOTSTRAP=1` disables the empty-users boot
 * refusal that stops Payload's unauthenticated first-register from handing Site Admin to the first
 * visitor (`lib/publicPosture.ts`, verified live 2026-07-05). It is a one-boot escape hatch whose
 * whole safety rests on being typed deliberately; a commented-out line in a template that someone
 * uncomments "to get past the error" is the exact failure mode. Documented in `docs/OPS.md` instead.
 */
const NEVER_IN_TEMPLATE = new Set(['ALLOW_FIRST_USER_BOOTSTRAP'])

/** Without these four, a host-local `next dev` run is misconfigured rather than merely untuned. */
const DEV_CRITICAL = ['DATABASE_URI', 'PAYLOAD_SECRET', 'ADMIN_URL', 'SERVER_URL']

/**
 * The env-reading helpers this checker follows. Assertion G pins this list to the env module's actual
 * exports, so a new helper cannot be added there without being registered here — otherwise it would
 * read env through a path this file never follows, and F would keep passing while its variable went
 * unverified.
 */
const HELPER_NAMES = new Set(['positiveIntEnv'])

/** Module specifiers that resolve to `src/lib/env.ts` from anywhere in the tree. */
const IS_ENV_MODULE = /(^|\/)(lib\/)?env$/

/**
 * `.js` is included deliberately: `allowJs` is on and `app/src` already contains five `.js` files
 * (the byte-pristine vendored ARES generator, plus Payload's generated importMap). None reads env
 * today — and if one ever does it must be visible here rather than silently unscanned. This test only
 * ever READS those files.
 */
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

const ENV_VAR = /^[A-Z][A-Z0-9_]*$/

/**
 * ⚑ EVERY source file is parsed, deliberately. A previous revision pre-filtered on a derived substring
 * regex to skip ~90% of the tree, and its comment claimed to be "provably a strict superset" of what
 * the AST can match. It was not: `process?.env.FOO` and `process/*c*​/.env.FOO` contain no contiguous
 * `process.env`, so both were skipped while the AST would have caught them. Verified by adding
 * `process?.env.X` to an env-free component and watching the suite stay GREEN.
 *
 * That optimisation bought ~80 ms in a test suite and cost the one property this file exists to
 * provide. No text-level filter is safe here, because the thing being filtered is source syntax and
 * the analyser works on syntax. Parse everything; at 173 files it is not worth reasoning about.
 */

const sourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        sourceFiles(join(dir, entry.name), acc)
      }
    } else if (SOURCE_EXT.test(entry.name)) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

/** Variables DECLARED in a `.env` template. `dotenv` is already a dependency and owns this format. */
const declaredIn = (template: Record<string, string>): Set<string> =>
  new Set(Object.keys(template).filter((k) => ENV_VAR.test(k)))

const parsed = new Map<string, ts.SourceFile>()

/** Parse once per path — `lib/env.ts` is needed by both the read scan and assertion G. */
const parse = (file: string, text: string): ts.SourceFile => {
  const cached = parsed.get(file)
  if (cached) return cached
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  parsed.set(file, sf)
  return sf
}

const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/**
 * Is this node `process.env`, however it is spelled? Both member forms count — `process.env` and
 * `process['env']` — and optional chaining (`process?.env`) is the same node kind, so it is covered
 * too. The bracket form used to be missed entirely: a read written `process["env"].FOO` was parsed and
 * then silently ignored, because this predicate only recognised property access.
 */
const isProcessEnv = (n: ts.Node): boolean => {
  const onProcess = (e: ts.Expression): boolean => ts.isIdentifier(e) && e.text === 'process'
  if (ts.isPropertyAccessExpression(n)) return n.name.text === 'env' && onProcess(n.expression)
  if (ts.isElementAccessExpression(n)) {
    return literalText(n.argumentExpression) === 'env' && onProcess(n.expression)
  }
  return false
}

const literalText = (n: ts.Node | undefined): string | null =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null

/**
 * Local bindings that refer to an env helper, following IMPORT RENAMES only. Anything else that could
 * put a helper beyond a name match — namespace import, re-export, dynamic import — is reported instead
 * of followed, and so is a plain `const f = positiveIntEnv` (handled by the escaped-value check in
 * `collectReads`, since `f` never enters this set).
 */
const helperBindings = (sf: ts.SourceFile): { names: Set<string>; problems: string[] } => {
  const names = new Set<string>()
  const problems: string[] = []

  walk(sf, (n) => {
    if (ts.isImportDeclaration(n)) {
      const spec = literalText(n.moduleSpecifier)
      if (!spec || !IS_ENV_MODULE.test(spec)) return
      const clause = n.importClause
      if (!clause) return
      if (clause.name) problems.push(`default import from the env module: ${clause.name.text}`)
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        // `import * as env` then `env.positiveIntEnv(…)` — a property call this parse would have to
        // model separately. Rejected rather than half-followed.
        problems.push(`namespace import of the env module: ${bindings.name.text}`)
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const imported = (el.propertyName ?? el.name).text
          if (HELPER_NAMES.has(imported)) names.add(el.name.text)
        }
      }
      return
    }
    // `export { positiveIntEnv } from './env'` / `export { helper }` — re-exporting moves the call
    // site out of this file's reach entirely.
    if (ts.isExportDeclaration(n)) {
      const spec = literalText(n.moduleSpecifier)
      const named =
        n.exportClause && ts.isNamedExports(n.exportClause) ? n.exportClause.elements : []
      const reExportsHelper = named.some((el) =>
        HELPER_NAMES.has((el.propertyName ?? el.name).text),
      )
      if ((spec && IS_ENV_MODULE.test(spec)) || reExportsHelper) {
        problems.push(`re-export of an env helper: ${n.getText(sf).slice(0, 80)}`)
      }
      return
    }
    // `await import('./env')` / `require('./env')` — the binding is created at runtime.
    if (ts.isCallExpression(n)) {
      const spec = literalText(n.arguments[0])
      const dynamic =
        n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require')
      if (dynamic && spec && IS_ENV_MODULE.test(spec)) {
        problems.push('dynamic import of the env module')
      }
    }
  })

  return { names, problems }
}

/**
 * Every variable the app reads, plus every env access this parse could not resolve to a name.
 * `next.config.ts` is included because it is app configuration running in the same process.
 */
const collectReads = (): { reads: Set<string>; problems: string[] } => {
  const reads = new Set<string>()
  const problems: string[] = []
  const files = [...sourceFiles(join(APP_DIR, 'src')), join(APP_DIR, 'next.config.ts')]

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(APP_DIR, file)
    const sf = parse(file, text)
    const { names: helpers, problems: bindingProblems } = helperBindings(sf)
    for (const p of bindingProblems) problems.push(`${rel}: ${p}`)

    /** The one legitimate dynamic read: `positiveIntEnv`'s own `process.env[name]`. Exactly one. */
    let dynamicReads = 0
    /** Helper references that are NOT a direct call — it could be invoked out of this parse's sight. */
    const escapedHelpers = new Set<string>()

    walk(sf, (n) => {
      // All three `process.env` shapes dispatch from the ONE node, so the parent-shape predicates are
      // written once. (They used to be duplicated across three sibling branches, free to disagree.)
      if (isProcessEnv(n)) {
        const p = n.parent
        if (p && ts.isPropertyAccessExpression(p) && p.expression === n) {
          if (ENV_VAR.test(p.name.text)) reads.add(p.name.text)
          else problems.push(`${rel}: non-conforming process.env property "${p.name.text}"`)
        } else if (p && ts.isElementAccessExpression(p) && p.expression === n) {
          const lit = literalText(p.argumentExpression)
          if (lit && ENV_VAR.test(lit)) reads.add(lit)
          else dynamicReads += 1
        } else {
          // Destructured, spread, passed along — a read this parse cannot attribute to a name.
          problems.push(`${rel}: unresolvable use of process.env`)
        }
        return
      }
      // A helper call: must name its variable literally.
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        helpers.has(n.expression.text)
      ) {
        const lit = literalText(n.arguments[0])
        if (lit && ENV_VAR.test(lit)) reads.add(lit)
        else problems.push(`${rel}: env-helper call without a literal variable name`)
        return
      }
      // A helper referenced as a VALUE — assigned to a `const`, passed, returned, stored. It could be
      // called anywhere, so the variable it reads is unknowable here. Import bindings are the
      // declaration site, not a use, so they are excluded.
      if (ts.isIdentifier(n) && helpers.has(n.text)) {
        const p = n.parent
        const isCallee = p && ts.isCallExpression(p) && p.expression === n
        const isImportBinding = p && (ts.isImportSpecifier(p) || ts.isImportClause(p))
        if (!isCallee && !isImportBinding) escapedHelpers.add(n.text)
      }
    })

    if (escapedHelpers.size > 0) {
      problems.push(
        `${rel}: env helper(s) used as a value, not called directly: ${[...escapedHelpers].join(', ')}`,
      )
    }

    // Exactly, not at-most: an allowance nobody spends is a hole waiting for the next dynamic read.
    const allowed = rel === ENV_MODULE_REL ? 1 : 0
    if (dynamicReads !== allowed) {
      problems.push(
        `${rel}: ${dynamicReads} dynamic process.env read(s), exactly ${allowed} allowed`,
      )
    }
  }

  return { reads, problems }
}

/**
 * Exported names of `src/lib/env.ts`, plus any export this inventory could not name.
 *
 * The `unnameable` half is the point. An earlier version enumerated the forms it knew and fell through
 * on the rest, so `export default function () {}` (anonymous), `export * from …` and `export * as ns
 * from …` were skipped in SILENCE while assertion G claimed every export form was named. Falling
 * through is the one thing this must never do: it is the whole class of bug this file was written
 * against. So anything unrecognised is reported, and G fails until it is either named or removed.
 */
const envModuleExports = (): { names: string[]; unnameable: string[] } => {
  const path = join(APP_DIR, ENV_MODULE_REL)
  const sf = parse(path, readFileSync(path, 'utf8'))
  const names: string[] = []
  const unnameable: string[] = []
  const modifiers = (n: ts.Node): readonly ts.Modifier[] =>
    ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : []
  const isExported = (n: ts.Node): boolean =>
    modifiers(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const isDefault = (n: ts.Node): boolean =>
    modifiers(n).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  const describe1 = (stmt: ts.Statement): string =>
    `${ts.SyntaxKind[stmt.kind]}: ${stmt.getText(sf).split('\n')[0].slice(0, 60)}`

  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt)) {
      // `export default <expr>` / `export = <expr>` — a value with no declared name.
      names.push('default')
    } else if (ts.isExportDeclaration(stmt)) {
      const clause = stmt.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) names.push(el.name.text)
      } else if (clause && ts.isNamespaceExport(clause)) {
        names.push(clause.name.text) // `export * as ns from …`
      } else {
        // `export * from …` — the names live in another module and cannot be enumerated here.
        unnameable.push(describe1(stmt))
      }
    } else if (!isExported(stmt)) {
      continue
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text)
        else unnameable.push(describe1(stmt)) // destructuring export
      }
    } else if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) {
      // An anonymous `export default function () {}` / `class {}` has no name node.
      if (stmt.name) names.push(stmt.name.text)
      else if (isDefault(stmt)) names.push('default')
      else unnameable.push(describe1(stmt))
    } else {
      unnameable.push(describe1(stmt))
    }
  }
  return { names: names.sort(), unnameable }
}

const readTemplate = (path: string): Record<string, string> => {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `env template not found: ${path}. If this is CI, the runner must mount the repo root and set LESSON3_REPO_ROOT (see .github/workflows/ci.yml).`,
    )
  }
  return parseEnvFile(raw)
}

/**
 * All the work, memoised and run on FIRST ASSERTION rather than at collection. Doing it in the
 * `describe` body meant a missing template threw while vitest was still collecting: the run reported
 * "no tests" with a stack and no failing test name — which is how the CI breakage below stayed
 * invisible. Deferring it means the same problem now fails a NAMED test with a message that says what
 * to do, which is the difference between a diagnosable gate and a mystery.
 */
let cached: {
  reads: Set<string>
  problems: string[]
  root: Set<string>
  app: Set<string>
  rootTemplate: Record<string, string>
  appTemplate: Record<string, string>
  configurable: string[]
} | null = null

const analysis = (): NonNullable<typeof cached> => {
  if (cached) return cached
  const { reads, problems } = collectReads()
  const rootTemplate = readTemplate(ROOT_TEMPLATE)
  const appTemplate = readTemplate(APP_TEMPLATE)
  cached = {
    reads,
    problems,
    rootTemplate,
    appTemplate,
    root: declaredIn(rootTemplate),
    app: declaredIn(appTemplate),
    /** App-read variables an operator is expected to configure. */
    configurable: [...reads]
      .filter((n) => !RUNTIME_PROVIDED.has(n) && !NEVER_IN_TEMPLATE.has(n))
      .sort(),
  }
  return cached
}

describe('env template parity', () => {
  it('F: every env read in the source resolved to a variable name', () => {
    // If this fails, either write the read in a followable form or TEACH THE CHECKER — do not delete
    // the assertion. A read it cannot resolve is a variable it cannot verify, and silence here would
    // be a false all-clear about the whole template.
    expect(analysis().problems).toEqual([])
  })

  it('G: lib/env.ts exports exactly the helpers this checker knows how to follow', () => {
    // A helper added to the env module would read env through a path this file does not follow, so F
    // would keep passing while its variable went unverified. Exports are read structurally, so any
    // form — const, function, class, enum, `export {}`, default — is named.
    //
    // If this fails: register the new export in HELPER_NAMES when it READS env; move it out of
    // lib/env.ts when it does not. Registering a non-env helper would make F treat its first argument
    // as a variable name, so the two cases genuinely need different fixes.
    const { names, unnameable } = envModuleExports()
    // Reported first: an export this inventory cannot name makes the comparison below meaningless.
    expect(unnameable, 'every export of lib/env.ts must be nameable').toEqual([])
    expect(names).toEqual([...HELPER_NAMES].sort())
  })

  it('A: the root template declares every configurable variable the app reads', () => {
    const { configurable, root } = analysis()
    expect(configurable.filter((n) => !root.has(n))).toEqual([])
  })

  it('B: the root template declares nothing the app does not read', () => {
    const { root, reads } = analysis()
    const stale = [...root].filter((n) => !reads.has(n) && !COMPOSE_ONLY.has(n)).sort()
    expect(stale).toEqual([])
  })

  it('C: the app template is host-local dev config only, and covers the dev-critical vars', () => {
    // It was a verbatim copy of the root file, so it carried Compose-only vars that mean nothing to a
    // host-local `next dev` run (notably POSTGRES_PASSWORD).
    const { app, reads } = analysis()
    expect([...app].filter((n) => !reads.has(n)).sort()).toEqual([])
    expect(DEV_CRITICAL.filter((n) => !app.has(n))).toEqual([])
  })

  it('D: the first-user bootstrap escape hatch is in neither template', () => {
    const { root, app } = analysis()
    for (const name of NEVER_IN_TEMPLATE) {
      expect(root.has(name), `${name} must not be in the root template`).toBe(false)
      expect(app.has(name), `${name} must not be in the app template`).toBe(false)
    }
  })

  it('E: each template points DATABASE_URI at the host ITS consumer must use', () => {
    // Reusing the seed script's own guard (scripts/lib/localDbGuard.ts) rather than matching on the
    // raw line: it parses with `new URL`, so a password containing '@' cannot fool it into reading the
    // wrong segment as the host — a defect that helper's docstring records from its own review.
    const { rootTemplate, appTemplate } = analysis()
    const rootUri = rootTemplate.DATABASE_URI ?? ''
    const appUri = appTemplate.DATABASE_URI ?? ''

    // Containers reach Postgres by compose service name over the internal network...
    expect(isLocalDatabaseUri(rootUri), 'root template must NOT point at localhost').toBe(false)
    expect(new URL(rootUri).hostname).toBe('postgres')
    // ...while host-local dev must use the port docker-compose.local.yml publishes (AGENTS.md).
    expect(isLocalDatabaseUri(appUri), 'app template MUST point at localhost').toBe(true)
    expect(new URL(appUri).port).toBe('55432')
  })
})
