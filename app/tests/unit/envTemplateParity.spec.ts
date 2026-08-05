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
 *   E. each template's `DATABASE_URI` has the host shape ITS consumer needs   → the AGENTS.md §Local
 *      stack requirement that host-local dev points at 127.0.0.1:55432
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
 * so it stays fast and DB-free). Helper bindings are RESOLVED rather than forbidden: an import rename
 * and a local `const` alias both work and are followed, while genuinely unanalyzable forms (namespace
 * import, re-export, dynamic import, or handing a helper around as a value) are reported by F. The
 * rule this file can honestly enforce is: **an env helper is only ever called directly, by a binding
 * this parse followed, with a literal variable name.**
 *
 * Deliberately DB-free and Payload-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import ts from 'typescript'

const APP_DIR = join(__dirname, '..', '..')
const REPO_DIR = join(APP_DIR, '..')
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

/** Declared assignments in a `.env` template: `NAME=` at line start (commented lines excluded). */
const declaredIn = (path: string): Set<string> => {
  const out = new Set<string>()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    if (m) out.add(m[1])
  }
  return out
}

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)

const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/** Is this node `process.env`? */
const isProcessEnv = (n: ts.Node): boolean =>
  ts.isPropertyAccessExpression(n) &&
  n.name.text === 'env' &&
  ts.isIdentifier(n.expression) &&
  n.expression.text === 'process'

const literalText = (n: ts.Node | undefined): string | null =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null

/**
 * Local bindings in a file that refer to an env helper — following import renames and `const` aliases
 * to a fixed point, so `import { positiveIntEnv as readInt }` and `const f = readInt` are both
 * followed rather than merely forbidden. Unanalyzable import forms are reported instead.
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
    }
    // `export { positiveIntEnv } from './env'` / `export { helper }` — re-exporting moves the call
    // site out of this file's reach entirely.
    if (ts.isExportDeclaration(n)) {
      const spec = literalText(n.moduleSpecifier)
      const named = n.exportClause && ts.isNamedExports(n.exportClause) ? n.exportClause.elements : []
      const reExportsHelper = named.some((el) => HELPER_NAMES.has((el.propertyName ?? el.name).text))
      if ((spec && IS_ENV_MODULE.test(spec)) || reExportsHelper) {
        problems.push(`re-export of an env helper: ${n.getText(sf).slice(0, 80)}`)
      }
    }
    // `await import('./env')` / `require('./env')` — the binding is created at runtime.
    if (ts.isCallExpression(n)) {
      const spec = literalText(n.arguments[0])
      const dynamic =
        n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require')
      if (dynamic && spec && IS_ENV_MODULE.test(spec)) {
        problems.push(`dynamic import of the env module`)
      }
    }
  })

  // Follow `const alias = binding` chains to a fixed point.
  for (let pass = 0; pass < 8; pass++) {
    const before = names.size
    walk(sf, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isIdentifier(n.initializer) &&
        names.has(n.initializer.text)
      ) {
        names.add(n.name.text)
      }
    })
    if (names.size === before) break
  }

  return { names, problems }
}

type Findings = { reads: Set<string>; problems: string[] }

/**
 * Every variable the app reads, plus every env access this parse could not resolve to a name.
 * `next.config.ts` is included because it is app configuration that runs in the same process.
 */
const collectReads = (): Findings => {
  const reads = new Set<string>()
  const problems: string[] = []
  const files = [...sourceFiles(join(APP_DIR, 'src')), join(APP_DIR, 'next.config.ts')]

  for (const file of files) {
    const rel = relative(APP_DIR, file)
    const sf = parse(file)
    const { names: helpers, problems: bindingProblems } = helperBindings(sf)
    for (const p of bindingProblems) problems.push(`${rel}: ${p}`)

    /** The one legitimate dynamic read: `positiveIntEnv`'s own `process.env[name]`. Exactly one. */
    let dynamicReads = 0
    /** References to a helper binding that are NOT a direct call — it could be invoked anywhere. */
    const escapedHelpers: string[] = []

    walk(sf, (n) => {
      // `process.env.NAME`
      if (ts.isPropertyAccessExpression(n) && isProcessEnv(n.expression)) {
        if (ENV_VAR.test(n.name.text)) reads.add(n.name.text)
        else problems.push(`${rel}: non-conforming process.env property "${n.name.text}"`)
        return
      }
      // `process.env['NAME']` / `process.env[name]`
      if (ts.isElementAccessExpression(n) && isProcessEnv(n.expression)) {
        const lit = literalText(n.argumentExpression)
        if (lit && ENV_VAR.test(lit)) reads.add(lit)
        else dynamicReads += 1
        return
      }
      // Any OTHER use of `process.env` — destructuring it, passing it, spreading it — is a read this
      // parse cannot attribute to a variable name.
      if (isProcessEnv(n)) {
        const parent = n.parent
        const attributed =
          parent &&
          ((ts.isPropertyAccessExpression(parent) && parent.expression === n) ||
            (ts.isElementAccessExpression(parent) && parent.expression === n))
        if (!attributed) problems.push(`${rel}: unresolvable use of process.env`)
        return
      }
      // A helper call: must name its variable literally.
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && helpers.has(n.expression.text)) {
        const lit = literalText(n.arguments[0])
        if (lit && ENV_VAR.test(lit)) reads.add(lit)
        else problems.push(`${rel}: env-helper call without a literal variable name`)
        return
      }
      // A helper referenced as a VALUE (passed, returned, stored in a structure). It could be called
      // out of this parse's sight, so the variable it reads is unknowable here.
      //
      // Three positions are NOT uses and must not be flagged — the last one caught a false positive
      // this guard produced on its own sanity-flip: an alias's DECLARATION NAME (`const readInt = …`)
      // is where the binding is introduced, and `helpers` contains it precisely because the alias was
      // followed successfully. Flagging it would have failed F on exactly the legitimate code the
      // alias-following exists to support.
      if (ts.isIdentifier(n) && helpers.has(n.text)) {
        const parent = n.parent
        const isCallee = parent && ts.isCallExpression(parent) && parent.expression === n
        const isImportBinding = parent && (ts.isImportSpecifier(parent) || ts.isImportClause(parent))
        const isAliasDeclaration =
          parent &&
          ts.isVariableDeclaration(parent) &&
          (parent.initializer === n || parent.name === n)
        if (!isCallee && !isImportBinding && !isAliasDeclaration) escapedHelpers.push(n.text)
      }
    })

    if (escapedHelpers.length > 0) {
      problems.push(
        `${rel}: env helper(s) used as a value, not called directly: ${[...new Set(escapedHelpers)].join(', ')}`,
      )
    }

    // Exactly, not at-most: an allowance nobody spends is a hole waiting for the next dynamic read.
    const allowed = rel === ENV_MODULE_REL ? 1 : 0
    if (dynamicReads !== allowed) {
      problems.push(`${rel}: ${dynamicReads} dynamic process.env read(s), exactly ${allowed} allowed`)
    }
  }

  return { reads, problems }
}

/** Exported value names of `src/lib/env.ts`, read structurally so no export form can hide. */
const envModuleExports = (): string[] => {
  const sf = parse(join(APP_DIR, ENV_MODULE_REL))
  const names: string[] = []
  const isExported = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) &&
    (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text)
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) &&
      isExported(stmt) &&
      stmt.name
    ) {
      names.push(stmt.name.text)
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.push(el.name.text)
    } else if (ts.isExportAssignment(stmt)) {
      names.push('default')
    }
  }
  return names.sort()
}

describe('env template parity', () => {
  const { reads, problems } = collectReads()
  const root = declaredIn(ROOT_TEMPLATE)
  const app = declaredIn(APP_TEMPLATE)

  /** App-read variables an operator is expected to configure. */
  const configurable = [...reads]
    .filter((n) => !RUNTIME_PROVIDED.has(n) && !NEVER_IN_TEMPLATE.has(n))
    .sort()

  it('F: every env read in the source resolved to a variable name', () => {
    // If this fails, either fix the source to a followable form or TEACH THE CHECKER — do not delete
    // the assertion. A read it cannot resolve is a variable it cannot verify, and silence here would
    // be a false all-clear about the whole template.
    expect(problems).toEqual([])
  })

  it('G: lib/env.ts exports exactly the helpers this checker knows how to follow', () => {
    // A helper added to the env module would read env through a path this file does not follow, so F
    // would keep passing while its variable went unverified. Exports are read structurally (any form
    // — const, function, class, enum, `export {}`, default — is named), so the only way to add one is
    // to register it in HELPER_NAMES.
    expect(envModuleExports()).toEqual([...HELPER_NAMES].sort())
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
