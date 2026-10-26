import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientKey, loginClient, withLoginCapacity } from '../../src/lib/loginProtection'

const clients = new Map<string, string>()
;(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('lesson3.loginClients')] = {
  clients,
}
const req = (token: string, client = token) => {
  clients.set(token, client)
  return { headers: new Headers({ 'x-lesson3-login-request': token }), payloadAPI: 'REST' } as never
}
afterEach(() => {
  clients.clear()
  vi.unstubAllEnvs()
})

describe('login admission', () => {
  it('groups IPv6 clients by /64 so one connection cannot rotate into fresh budgets', () => {
    const key = clientKey('2001:db8:1:2::1')
    expect(key).toBe('2001:db8:1:2::/64')
    for (const same of [
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:0DB8:0001:0002::abcd',
      '2001:db8:1:2:0:0:1.2.3.4',
    ])
      expect(clientKey(same)).toBe(key)
    expect(clientKey('2001:db8:1:3::1')).not.toBe(key)
    expect(clientKey('::1')).toBe('0:0:0:0::/64')
    expect(clientKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(clientKey('192.0.2.1')).toBe('192.0.2.1')
    expect(loginClient(req('v6a', '2001:db8:1:2::1'), 'x')).toBe(
      loginClient(req('v6b', '2001:db8:1:2::99'), 'x'),
    )
  })
  it('refuses a forged/missing tracker token over HTTP, including on reauthentication', () => {
    expect(() =>
      loginClient({ headers: new Headers(), payloadAPI: 'REST' } as never, 'x'),
    ).toThrow()
    expect(() =>
      loginClient(
        {
          headers: new Headers({ 'x-lesson3-login-request': 'forged' }),
          payloadAPI: 'local',
        } as never,
        'x',
      ),
    ).toThrow()
  })
  it('separates trusted in-process callers by target without using a site-wide key', () => {
    const r = { headers: new Headers(), payloadAPI: 'local' } as never
    expect(loginClient(r, 'one')).not.toBe(loginClient(r, 'two'))
  })
  it('one busy client cannot take a second slot or block another client', async () => {
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const a = req('a', '192.0.2.1')
    const b = req('b', '192.0.2.2')
    const first = withLoginCapacity(a, 'victim', () => wait)
    await expect(withLoginCapacity(a, 'other', async () => 1)).rejects.toMatchObject({
      status: 429,
    })
    await expect(withLoginCapacity(b, 'victim', async () => 2)).resolves.toBe(2)
    release()
    await first
    await expect(withLoginCapacity(a, 'victim', async () => 3)).resolves.toBe(3)
  })
  it('bounds aggregate work and releases slots on errors', async () => {
    vi.stubEnv('LOGIN_MAX_CONCURRENT', '1')
    let release!: () => void
    const a = req('a')
    const b = req('b')
    const first = withLoginCapacity(
      a,
      '',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await expect(withLoginCapacity(b, '', async () => 1)).rejects.toMatchObject({ status: 503 })
    release()
    await first
    await expect(
      withLoginCapacity(b, '', async () => {
        throw new Error('failure')
      }),
    ).rejects.toThrow('failure')
    await expect(withLoginCapacity(b, '', async () => 2)).resolves.toBe(2)
  })
  it('shares capacity across separate loads of the server module', async () => {
    const a = req('a')
    let release!: () => void
    const first = withLoginCapacity(
      a,
      '',
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    try {
      vi.resetModules()
      const second = await import('../../src/lib/loginProtection')
      await expect(second.withLoginCapacity(a, '', async () => 1)).rejects.toMatchObject({
        status: 429,
      })
    } finally {
      release()
      await first
    }
  })
})
