import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { APIError, type PayloadRequest } from 'payload'
import { positiveIntEnv } from './env'

type Tracking = { clients: Map<string, string> }
const KEY = Symbol.for('lesson3.loginClients')
type Capacity = { active: Set<string>; total: number }
const CAPACITY = Symbol.for('lesson3.loginCapacity')
const globals = globalThis as unknown as Record<symbol, Capacity | undefined>
// Share admission state even if Next loads this module in separate server chunks.
const capacity = (globals[CAPACITY] ??= { active: new Set(), total: 0 })

/**
 * The unit a budget belongs to. One IPv6 subscriber is routinely handed a whole /64, so keying the
 * full address would let a single connection mint fresh budgets at will; group it by /64 instead.
 */
export function clientKey(address: string): string {
  if (isIP(address) !== 6) return address
  let ip = address.split('%')[0].toLowerCase()
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip)
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number)
    ip = `${ip.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail === undefined ? [] : tail ? tail.split(':') : []
  const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`
}

export function loginClient(req: PayloadRequest, target: string): string {
  const tracking = (globalThis as unknown as Record<symbol, Tracking | undefined>)[KEY]
  const token = req.headers?.get('x-lesson3-login-request')
  const client = token ? tracking?.clients.get(token) : undefined
  if (client) return createHash('sha256').update(clientKey(client)).digest('hex')
  // In-process scripts are trusted callers, not anonymous HTTP requests. Reauthentication passes
  // the original headers so a web caller cannot use this fallback through the settings endpoint.
  if (req.payloadAPI === 'local' && !token) {
    return `local:${createHash('sha256').update(target).digest('hex')}`
  }
  throw new APIError('Sign-in is unavailable — the server needs its client-address tracker.', 503)
}

/** No queues and no leaked capacity, even when authentication throws or the caller disconnects. */
export async function withLoginCapacity<T>(
  req: PayloadRequest,
  target: string,
  work: () => Promise<T>,
): Promise<T> {
  const client = loginClient(req, target)
  if (capacity.active.has(client))
    throw new APIError('Sign-in is busy — please try again shortly.', 429)
  if (capacity.total >= positiveIntEnv('LOGIN_MAX_CONCURRENT', 4)) {
    throw new APIError('Sign-in is busy — please try again shortly.', 503)
  }
  capacity.active.add(client)
  capacity.total++
  try {
    return await work()
  } finally {
    capacity.active.delete(client)
    capacity.total--
  }
}
