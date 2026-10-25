import { createHash } from 'node:crypto'
import { APIError, type PayloadRequest } from 'payload'
import { positiveIntEnv } from './env'

type Tracking = { clients: Map<string, string> }
const KEY = Symbol.for('lesson3.loginClients')
type Capacity = { active: Set<string>; total: number }
const CAPACITY = Symbol.for('lesson3.loginCapacity')
const globals = globalThis as unknown as Record<symbol, Capacity | undefined>
// Share admission state even if Next loads this module in separate server chunks.
const capacity = (globals[CAPACITY] ??= { active: new Set(), total: 0 })

export function loginClient(req: PayloadRequest, target: string): string {
  const tracking = (globalThis as unknown as Record<symbol, Tracking | undefined>)[KEY]
  const token = req.headers?.get('x-lesson3-login-request')
  const client = token ? tracking?.clients.get(token) : undefined
  if (client) return createHash('sha256').update(client).digest('hex')
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
