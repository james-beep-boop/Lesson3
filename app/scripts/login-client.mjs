// Loaded before the HTTP server. Never trust an address supplied by a direct client.
import { channel } from 'node:diagnostics_channel'
import { randomBytes } from 'node:crypto'
import { BlockList, isIP } from 'node:net'

const KEY = Symbol.for('lesson3.loginClients')
export const REQUEST_HEADER = 'x-lesson3-login-request'

const normalize = (value) =>
  typeof value === 'string' && value.startsWith('::ffff:') && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : value

export function trustedProxyList(cidrs) {
  const list = new BlockList()
  for (const entry of cidrs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [raw, bits, extra] = entry.split('/')
    const address = normalize(raw)
    const family = isIP(address)
    const prefix = bits === undefined ? (family === 4 ? 32 : 128) : Number(bits)
    if (!family || extra !== undefined || (bits !== undefined && !/^\d+$/.test(bits))) {
      throw new Error('AUTH_TRUSTED_PROXY_CIDRS must contain only IP addresses or CIDRs')
    }
    list.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6')
  }
  return list
}

export function resolveClientAddress(peer, forwarded, trusted) {
  let address = normalize(peer)
  if (!isIP(address)) return null
  const trusts = (ip) => trusted.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6')
  if (!trusts(address) || typeof forwarded !== 'string') return address
  const hops = forwarded.split(',').map((s) => normalize(s.trim()))
  if (hops.length > 20 || hops.some((ip) => !isIP(ip))) return address
  // Walk from the socket towards the caller; ignore any spoofed prefix before the first untrusted hop.
  for (const hop of hops.reverse()) {
    if (!trusts(address)) break
    address = hop
  }
  return address
}

export function installLoginClientTracking(cidrs = '') {
  if (globalThis[KEY]) return globalThis[KEY]
  const trusted = trustedProxyList(cidrs)
  const state = { clients: new Map() }
  globalThis[KEY] = state
  channel('http.server.request.start').subscribe(({ request, response, socket }) => {
    // Overwrite even a caller-supplied internal token; none can name another request's client.
    const token = randomBytes(24).toString('hex')
    const client = resolveClientAddress(
      socket.remoteAddress,
      request.headers['x-forwarded-for'],
      trusted,
    )
    request.headers[REQUEST_HEADER] = token
    if (client) state.clients.set(token, client)
    response.once('close', () => state.clients.delete(token))
  })
  return state
}

installLoginClientTracking(process.env.AUTH_TRUSTED_PROXY_CIDRS ?? '')
