import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginClient, withLoginCapacity } from '../../src/lib/loginProtection'

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
