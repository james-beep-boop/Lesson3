/**
 * Enqueue a job that must NOT join the caller's database transaction (L3-03, 2026-07-21).
 *
 * WHY THIS EXISTS AS A NAMED FUNCTION. `payload.jobs.queue({ task, input })` and
 * `payload.jobs.queue({ task, input, req })` are one token apart, and the difference is invisible at
 * the call site. Passing `req` enlists the job INSERT in the caller's transaction, so a failed insert
 * aborts it — and because every best-effort site also swallows the error, the doomed commit degrades
 * into a silent rollback. Installed drizzle's `commitTransaction` is:
 *
 *     try   { await session.resolve() }   // COMMIT — throws, transaction is aborted
 *     catch { await session.reject()  }   // ROLLBACK, error swallowed
 *
 * A failed commit therefore rolls back WITHOUT rethrowing. The caller returns 2xx with a populated
 * document in the body, and nothing is persisted. There is no type error, no local symptom, and no
 * failing test at the offending site — which is exactly why prose was not a sufficient guard: three
 * separate call sites had to remember the rule, and one wrong token loses a write remotely and
 * silently.
 *
 * This function takes NO `req` parameter, so the mistake is unrepresentable. `jobs.queue` falls back
 * to `createLocalReq({}, payload)`, giving the insert its own pool connection.
 *
 * THE TRADE, which every caller inherits: the job row is no longer atomic with the primary write. If
 * that write rolls back afterwards for an unrelated reason, the job is orphaned. Handlers must
 * therefore tolerate an input referencing a row that no longer exists — `messagePing` re-checks the
 * message before announcing it, rather than emailing about a message nobody can open.
 *
 * ERROR HANDLING IS THE CALLER'S. This deliberately does not swallow or log: the three call sites
 * have genuinely different catch scopes (forgot-password's spans the user lookup, the prewarm's spans
 * its readiness reads), and collapsing them here would silently widen or narrow what each one guards.
 * The invariant worth centralising is the connection, not the recovery.
 */
import type { Payload, TypedJobs } from 'payload'

/**
 * GENERIC over the task slug, deliberately — mirroring how `payload.jobs.queue` itself keeps `task`
 * and `input` correlated (its correlation lives in a type PARAMETER, so `Parameters<>` on it collapses
 * `input` to the union of every task's input and loses the check). Instantiating per call restores it:
 * `enqueueDetached(p, { task: 'messagePing', input: { versionId, kind } })` is rejected here exactly as
 * the native call rejects it.
 *
 * The argument shape is `{ task, input }` and nothing else — no `req` (passing one is the silent
 * lost-write bug this exists to prevent) and no `workflow`. Restricted to tasks; no caller enqueues a
 * workflow. Both negative cases are pinned in `tests/unit/enqueueDetached.spec.ts`.
 */
export async function enqueueDetached<TSlug extends keyof TypedJobs['tasks']>(
  payload: Payload,
  args: { task: TSlug; input: TypedJobs['tasks'][TSlug]['input'] },
): Promise<void> {
  // RECONSTRUCT — never forward the caller's object. Excess-property checking rejects a stray `req`
  // ONLY on a fresh object literal at the call site; a prebuilt wider object is structurally
  // assignable to this parameter, and the cast below would then forward its extra `req` to
  // `jobs.queue` at runtime — re-opening the silent-rollback bug this whole file exists to prevent.
  // Picking `{ task, input }` off `args` guarantees only those two keys ever reach `queue`.
  const { task, input } = args
  await payload.jobs.queue({ task, input } as Parameters<Payload['jobs']['queue']>[0])
}
