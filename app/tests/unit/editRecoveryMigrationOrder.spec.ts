/**
 * Statement ORDER in the edit-recovery migration's `down`.
 *
 * Two hand edits were made to generator output because the generated `down` could not execute, and
 * both were found by RUNNING the rollback rather than reading it. The realistic way to lose them is
 * regeneration — a later schema change re-runs `payload migrate:create`, the generator emits its own
 * ordering again, and the fix silently disappears. The migration file even carries a "do not tidy
 * this back" comment, which is a request, not a guard.
 *
 * ⚑ What this test does and does not prove. It pins the ORDER of statements in the source text; it
 * does not execute them. Real execution against a migration-only database is migration-gate work
 * (`docs/NEXT-SESSION.md`), and was done by hand for this migration. The test is here because the
 * failure mode is OMISSION, and omission is exactly what a fast text-level check catches — the same
 * reasoning CLAUDE.md gives for pinning a security-critical invariant with a wiring test rather than
 * trusting review.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const MIGRATION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/migrations/20260806_185943_add_edit_recovery.ts',
)

const source = readFileSync(MIGRATION, 'utf8')

/**
 * The `down` half of the file, with `--` comments stripped.
 *
 * ⚑ Both steps are load-bearing, and the second was found by this test failing. Slicing at the export
 * keeps `up`'s statements out of the ordering. Removing comments matters because the hand-edit notes
 * deliberately QUOTE the statements they are about — the note above the FK drop contains the exact
 * text `DROP TABLE "edit_recovery" CASCADE`, so a search over the raw source finds the comment first
 * and reports an order that is the reverse of the real one. A test that reads source text has to read
 * only the part that executes.
 *
 * No assertion here that `down` still exists. If the export were renamed away, `indexOf` returns -1
 * and this collapses to a single character, so every `at()` below fails inside a NAMED test. Checking
 * it at module scope instead would turn the same condition into a collection-time error with no test
 * name attached — the opposite of failing loudly.
 */
const downBody = source.slice(source.indexOf('export async function down')).replace(/--.*$/gm, '')

/** Index of `needle` in `down`, asserted present so a missing statement fails loudly, not silently. */
const at = (needle: string): number => {
  const i = downBody.indexOf(needle)
  expect(i, `the rollback no longer contains: ${needle}`).toBeGreaterThan(-1)
  return i
}

describe('edit-recovery migration: down statement order', () => {
  /**
   * The generator emitted this DROP CONSTRAINT *after* `DROP TABLE ... CASCADE`, where it cannot
   * execute: the CASCADE has already removed the constraint, so the explicit drop fails with
   * "constraint ... does not exist" and the whole rollback aborts.
   */
  it('drops the locked-documents FK BEFORE the CASCADE that would already have removed it', () => {
    expect(at('DROP CONSTRAINT "payload_locked_documents_rels_edit_recovery_fk"')).toBeLessThan(
      at('DROP TABLE "edit_recovery" CASCADE'),
    )
  })

  /**
   * ⚑ The regression guard for the fix in `206252a`. The enum shrink casts EXISTING rows into the
   * reduced type, so a single row carrying 'expireEditRecovery' aborts the rollback with "invalid
   * input value for enum". The task carries a schedule, so those rows appear on their own — meaning
   * the generated `down` worked only on a database where the app had never started.
   */
  it('deletes this task’s job rows BEFORE shrinking either task_slug enum', () => {
    const deleteLog = at(`DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'expireEditRecovery'`)
    const deleteJobs = at(`DELETE FROM "payload_jobs" WHERE "task_slug" = 'expireEditRecovery'`)

    // Logs first: they reference jobs via _parent_id.
    expect(deleteLog).toBeLessThan(deleteJobs)

    // Both enums are shrunk by casting the column to text and rebuilding the type. Neither cast may
    // run while a row still carries the value being removed from the type.
    const shrinkLog = at(
      'ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text',
    )
    const shrinkJobs = at('ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text')
    expect(deleteJobs).toBeLessThan(shrinkLog)
    expect(deleteJobs).toBeLessThan(shrinkJobs)
  })

  it('removes the enum value it added — the rebuilt types must not list expireEditRecovery', () => {
    const rebuilt = downBody.match(/CREATE TYPE [^;]+task_slug" AS ENUM\([^)]*\)/g) ?? []
    expect(rebuilt, 'both task_slug enums are rebuilt on the way down').toHaveLength(2)
    for (const stmt of rebuilt) expect(stmt).not.toContain('expireEditRecovery')
  })
})
