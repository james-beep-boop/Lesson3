#!/usr/bin/env node
/**
 * Preflight: refuse to build or dev-run when a root-level `app/` shadows `src/app`.
 *
 * ⚑ WHY THIS EXISTS. Next.js prefers a root-level `./app` over `./src/app` when BOTH are present.
 * This project's App Router is `src/app`, so a stray `<project>/app/` makes `next build` emit a build
 * with ZERO application routes — no `/login`, no `/api/[...slug]` — and exit 0. The served container
 * then 500s every request with a `ChunkLoadError` from `_not-found`, which points at the bundler and
 * not at the cause. That misdiagnosis cost two sessions.
 *
 * ⚑ WHY A SCRIPT AND NOT JUST `.dockerignore`. `app/.dockerignore` excludes `/app`, which protects
 * IMAGE builds. It does nothing for `next dev` or `next build` run on the host — the two commands a
 * developer actually reaches for first. The failure is silent in both, so the guard has to live where
 * `next` lives.
 *
 * ⚑ WHY IT CANNOT BE A TEST. Git cannot track an empty directory, so the offending state is
 * unrepresentable in the repository and invisible to `git status`, CI and the Rock. Only a check
 * against the working filesystem, at the moment of build, can see it.
 *
 * HOW IT HAPPENS: the probe recipe's `docker run -v "$PWD/app:/app" -v /app/node_modules …` run from
 * inside `app/` instead of the repo root. Docker CREATES a missing bind source, minting
 * `<root>/app/app/node_modules`. See AGENTS.md → "test:int on a disposable local stack", step 0.
 *
 * If this project ever genuinely moves its App Router to a root-level `app/`, delete this script AND
 * the `/app` rule in `app/.dockerignore` — otherwise the same zero-route build returns with its cause
 * hidden one layer deeper.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shadowing = join(projectRoot, 'app')
const canonical = join(projectRoot, 'src', 'app')

if (existsSync(shadowing) && existsSync(canonical)) {
  // Report what is actually in there — an empty tree is the accidental case and is safe to delete,
  // while a populated one means someone started a real migration and needs a decision, not a `rm`.
  let contents = []
  try {
    contents = readdirSync(shadowing)
  } catch {
    /* unreadable is still shadowing; fall through with an empty listing */
  }

  process.stderr.write(
    [
      '',
      '  ✖ A root-level `app/` is shadowing `src/app/`.',
      '',
      `    shadowing: ${shadowing}`,
      `    canonical: ${canonical}`,
      `    contains:  ${contents.length ? contents.join(', ') : '(empty)'}`,
      '',
      '    Next.js prefers `./app` over `./src/app`, so the build would silently produce ZERO',
      '    application routes and still exit 0. The served app then 500s every request with a',
      '    ChunkLoadError that points at the bundler rather than at this.',
      '',
      contents.length === 0 || (contents.length === 1 && contents[0] === 'node_modules')
        ? '    This looks like the accidental Docker bind-mount artefact. Remove it:\n' +
          `      rm -rf "${shadowing}"`
        : '    This directory has real contents — do NOT delete it blindly. If the App Router is\n' +
          '    genuinely moving here, remove this check and the `/app` rule in app/.dockerignore.',
      '',
      '    Background: AGENTS.md → "test:int on a disposable local stack", step 0.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}
