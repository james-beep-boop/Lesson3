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
import type { Payload } from 'payload'

/** The `task`-shaped half of Payload's queue argument (it is a union with a `workflow` variant),
 *  with `req` REMOVED — so passing one is a compile error rather than a silent lost write. Derived
 *  from the installed signature so task slugs and their input types stay checked, and so a Payload
 *  upgrade that changes the shape surfaces here instead of at three call sites. */
type DetachedQueueArgs = Omit<Extract<Parameters<Payload['jobs']['queue']>[0], { task: unknown }>, 'req'>

export async function enqueueDetached(payload: Payload, args: DetachedQueueArgs): Promise<void> {
  await payload.jobs.queue(args)
}
