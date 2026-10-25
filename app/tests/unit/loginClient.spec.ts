import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { describe, it, expect } from 'vitest'
import {
  installLoginClientTracking,
  resolveClientAddress,
  trustedProxyList,
} from '../../scripts/login-client.mjs'

describe('login client address boundary', () => {
  it('ignores all forwarded addresses from an untrusted socket', () => {
    expect(resolveClientAddress('::ffff:192.0.2.10', '203.0.113.8', trustedProxyList(''))).toBe(
      '192.0.2.10',
    )
  })
  it('walks trusted hops from right to left and ignores a forged prefix', () => {
    expect(
      resolveClientAddress(
        '127.0.0.1',
        '198.51.100.9, 203.0.113.8, 10.0.0.2',
        trustedProxyList('127.0.0.1,10.0.0.0/8'),
      ),
    ).toBe('203.0.113.8')
  })
  it('falls back to the socket on malformed or excessive forwarding chains', () => {
    for (const value of ['garbage', '203.0.113.1, bad', Array(21).fill('203.0.113.1').join(',')]) {
      expect(resolveClientAddress('127.0.0.1', value, trustedProxyList('127.0.0.1'))).toBe(
        '127.0.0.1',
      )
    }
  })
  it('supports IPv6 and refuses invalid trust configuration', () => {
    expect(resolveClientAddress('::1', '2001:db8::1', trustedProxyList('::1/128'))).toBe(
      '2001:db8::1',
    )
    for (const cidr of ['not-an-ip', '10.0.0.1/33', '::1/129', '127.0.0.1/-1', '127.0.0.1/'])
      expect(() => trustedProxyList(cidr)).toThrow()
  })
  it('replaces a forged internal token before the first real HTTP handler runs', async () => {
    const state = installLoginClientTracking('')
    const server = createServer((req, res) => {
      const token = req.headers['x-lesson3-login-request'] as string
      res.end(JSON.stringify({ token, client: state.clients.get(token) }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const port = (server.address() as { port: number }).port
      const result = await new Promise<string>((resolve, reject) => {
        request(
          {
            port,
            host: '127.0.0.1',
            headers: { 'x-lesson3-login-request': 'forged', 'x-forwarded-for': '203.0.113.1' },
          },
          (res) => {
            let data = ''
            res.on('data', (chunk) => {
              data += chunk
            })
            res.on('end', () => resolve(data))
          },
        )
          .on('error', reject)
          .end()
      })
      const body = JSON.parse(result)
      expect(body.token).not.toBe('forged')
      expect(body.client).toBe('127.0.0.1')
      await new Promise((resolve) => setImmediate(resolve))
      expect(state.clients.has(body.token)).toBe(false)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
