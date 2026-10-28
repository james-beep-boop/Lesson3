# P178-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope read:** `app/tests/unit/envTemplateParity.spec.ts:1-400`, read in full as supplied. The range ends inside `collectReads` (line 398 onward), so that function's body and everything after line 400 are **not assessed**. I ran nothing; all findings below come from reading the text.

**Purpose and invariants (as the file states them):** a parse-only guard (TypeScript AST, no type checker) asserting A–G: app-read variables are declared in the root `.env.example`; declared variables are read or Compose-only; the app template holds only app-read variables; `ALLOW_FIRST_USER_BOOTSTRAP` and `ATTRIBUTION_YAML` stay out of all templates; each `DATABASE_URI` points at the right host; every env read is resolvable (F); and `lib/env.ts` exports are pinned (G). Its own rule for F: an env helper is called only directly, through an imported binding, with a literal name. Anything else must be reported.

**Local reasoning found no defect in** `resolveSpecifier` and `isEnvModule` (`:164-178`), `unwrap` (`:256`), `literalText` (`:252`), `accessedName` (`:274`), or `processEnvBase` (`:289`), when checked against the file's stated cases.

**Candidates** (all Low; they affect the guard's completeness, not product behaviour)

1. **Empty `LESSON3_REPO_ROOT` is used as a path** (confirmed by local reasoning). `envTemplateParity.spec.ts:84` uses `??`, which falls back only on null or undefined. `LESSON3_REPO_ROOT=` gives `REPO_DIR = ''`, so `ROOT_TEMPLATE` becomes `join('', '.env.example')`, which resolves against the process cwd. Expected: fall back to the parent directory, as the file already requires for empty values at `:92-93`. Actual: root-template assertions read whatever `.env.example` is under cwd, with no named error. Reproduction: in a fresh module load (the constant is evaluated at import), set the variable to `''` and assert `ROOT_TEMPLATE` equals `join(APP_DIR, '..', '.env.example')`.

2. **Computed `globalThis` access to `process.env` is not reported** (confirmed by local reasoning, subject to unseen code). `denotesProcess` returns false when `accessedName` is null (`:312-313`), and nothing in the lines assessed reports a computed access on `globalThis`. `(globalThis['pro' + 'cess'] as any).env.SECRET` yields no read and no problem. Expected: F reports it, since "every process reference the walk did not classify is reported" (`:47-50`). Caveat: `collectReads` beyond line 400 could contain a fallback. Reproduction: a fixture under the scanned `app/` tree, then run `collectReads` and expect a problem.

3. **`import x = require('./env')` is not inspected** (confirmed by local reasoning). `helperBindings` handles only `ImportDeclaration`, `ExportDeclaration` and `CallExpression` (`:331-388`). `env.positiveIntEnv('X', 1)` through this form is neither followed nor reported. Whether the project's tsconfig accepts `import =` is not assessed. Reproduction: a fixture using that form, expecting a "namespace import" problem.

4. **`module.require('./env')` is not recognised** (lead). `:370-373` matches only the bare identifier `require` and the `import` keyword. A property-call or aliased `require` loading the env module is not reported.

5. **Only `globalThis`/`global` roots count as `process`** (lead). `denotesProcess` (`:306-318`) exempts any identifier that is a property name (`:310`), and property accesses qualify only through `globalThis`/`global`. So `self.process.env.X`, `window.process.env.X` and `this.process.env.X` produce no read and no report. Runtime impact is probably low, but the completeness claims at `:22-23` and `:44-50` are broader than the classifier.

6. **Symlinked directories are skipped silently** (lead). In `sourceFiles` (`:220-228`), `Dirent.isDirectory()` is false for symlinks, so they are neither followed nor reported. Env reads under a symlinked directory in the scanned tree go unseen, contrary to F.

7. **Aliased re-export is not matched** (lead). The export check (`:357-368`) compares export names to `HELPER_NAMES` by original name. `import { positiveIntEnv as h } from './env'; export { h as x }` is not reported at this site. Whether `collectReads` catches `h` through its escaped-value check is beyond line 400.

**Not reported, by design:** a local binding named `process` (no scope analysis, `:307`) can produce false positives. This is conservative and not a missed read.

**Unresolved questions**
- Does `collectReads` scan `app/tests`? This file reads `process.env.LESSON3_REPO_ROOT` at `:84`. If it is scanned, that read must be classified and the variable declared or exempt.
- Does `collectReads` report helpers escaping through `export default` or `export { h as x }`?
- Is the lack of scope analysis for `process` (`:307`) an accepted trade-off?
