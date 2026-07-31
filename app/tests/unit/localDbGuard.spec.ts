/**
 * The localhost guard for `scripts/seed-local-dev.ts` (`scripts/lib/localDbGuard.ts`).
 *
 * That script creates accounts with a KNOWN password. The only thing stopping it being pointed at
 * the Rock is this predicate, so it is pinned here rather than trusted to review — the same reason
 * CLAUDE.md asks for a fast test on any security-critical invariant.
 *
 * Two cases below are not hypothetical; both were real defects in the first draft:
 *   • a password containing '@' fooled the original regex into reading the wrong segment as the host;
 *   • WHATWG `hostname` returns IPv6 literals bracketed (`[::1]`), so comparing against the bare
 *     `::1` refused a valid loopback URI (caught in review before merge).
 */
import { describe, expect, it } from 'vitest'

import { isLocalDatabaseUri } from '../../scripts/lib/localDbGuard'

describe('seed-local-dev localhost guard', () => {
  it('accepts every loopback spelling, including the bracketed IPv6 form', () => {
    for (const uri of [
      'postgres://lesson3:pw@localhost:5432/lesson3',
      'postgres://lesson3:pw@127.0.0.1:55432/lesson3',
      'postgres://lesson3:pw@[::1]:5432/lesson3',
    ]) {
      expect(isLocalDatabaseUri(uri), uri).toBe(true)
    }
  })

  it('refuses a remote or compose-network host', () => {
    for (const uri of [
      'postgres://lesson3:pw@rock5b:5432/lesson3', // the Rock
      'postgres://lesson3:pw@postgres:5432/lesson3', // the compose service — NOT the host
      'postgres://lesson3:pw@10.0.0.5:5432/lesson3',
      'postgres://lesson3:pw@db.example.com:5432/lesson3',
    ]) {
      expect(isLocalDatabaseUri(uri), uri).toBe(false)
    }
  })

  it("is not fooled by an '@' inside the password", () => {
    // The original hand-rolled `split` read `ss@rock5b` here and mis-hosted it. `new URL` resolves
    // credentials properly, so the real host is seen and refused.
    expect(isLocalDatabaseUri('postgres://lesson3:p@ss@rock5b:5432/lesson3')).toBe(false)
    // ...and the same trick must not smuggle a remote host past a localhost-looking prefix.
    expect(isLocalDatabaseUri('postgres://localhost:pw@rock5b:5432/lesson3')).toBe(false)
  })

  it('fails CLOSED on anything it cannot parse', () => {
    // A bug in the predicate should refuse a legitimate run, never permit a dangerous one.
    for (const uri of ['', 'not a uri', 'postgres://', '://localhost/db']) {
      expect(isLocalDatabaseUri(uri), JSON.stringify(uri)).toBe(false)
    }
  })
})
