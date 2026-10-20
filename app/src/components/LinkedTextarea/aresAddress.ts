import { parseExternalUrl } from './insertLink'

/** Public installation bases only; no network requests or document-time rewriting. */
export type AresAddresses = { siteUrl?: string; kolibriUrl?: string; aliases?: string[] }

type AresBase = { origin: string; prefix: string; kolibri: boolean }

/**
 * Kolibri appends its own navigation state to the address a teacher copies from the address bar
 * (`…#/topics/c/<id>?prevName=…&prevParams=…`), which Lesson3 does not need and which makes the link
 * very long. Mark's rule (ARES, 2026-10-21): remove `?prev` and everything after it, from any ARES
 * address; it is never needed for direct navigation to the source. Kolibri is the main source.
 */
const ARES_NAVIGATION = '?prev'
export const withoutAresNavigation = (address: string): string => {
  const at = address.indexOf(ARES_NAVIGATION)
  return at === -1 ? address : address.slice(0, at)
}

/**
 * Match an origin and a whole path prefix; a shared hostname alone grants no match. Only the base is
 * replaced: a tracker address (`/tracker/…_launch.html?target=…`) is kept as copied, because ARES
 * counts a visit only when the link goes through its tracker (Mark, ARES, 2026-10-21).
 */
export function normalizeAresAddress(value: string | URL, settings: AresAddresses = {}): string {
  const bases: AresBase[] = []
  const add = (address: string | undefined, kolibri: boolean) => {
    const url = address && parseExternalUrl(address)
    if (url) bases.push({ origin: url.origin, prefix: url.pathname.replace(/\/$/, ''), kolibri })
  }
  for (const protocol of ['http:', 'https:']) {
    add(`${protocol}//ares.local`, false)
    add(`${protocol}//ares.local:8069`, true)
    // An address copied on the ARES machine itself works only there and is never tracked (Mark, ARES,
    // 2026-10-21), so it is stored as `ares.local` like every other ARES link.
    for (const loopback of ['localhost', '127.0.0.1']) {
      add(`${protocol}//${loopback}`, false)
      add(`${protocol}//${loopback}:8069`, true)
    }
    add(`${protocol}//demo.aresedu.dev`, false)
    add(`${protocol}//demo.aresedu.dev/kolibri`, true)
    for (const alias of settings.aliases ?? []) {
      const url = parseExternalUrl(`${protocol}//${alias}`)
      // Aliases are exact hostnames/IPs, not URLs, ports or path prefixes.
      if (!url || url.hostname !== alias.toLowerCase() || url.port) continue
      add(`${protocol}//${alias}`, false)
      add(`${protocol}//${alias}:8069`, true)
    }
  }
  add(settings.siteUrl, false)
  add(settings.kolibriUrl, true)
  // The most specific base wins, even when a pathless Kolibri shares the site origin.
  bases.sort((a, b) => b.prefix.length - a.prefix.length || Number(b.kolibri) - Number(a.kolibri))
  const address = typeof value === 'string' ? value : value.href
  const url = typeof value === 'string' ? parseExternalUrl(value) : value
  const base =
    url &&
    bases.find(
      (base) =>
        base.origin === url.origin &&
        (url.pathname === base.prefix || url.pathname.startsWith(`${base.prefix}/`)),
    )
  if (!url || !base) return address
  const relativePath = url.pathname.slice(base.prefix.length) || '/'
  return withoutAresNavigation(
    `http://ares.local${base.kolibri ? ':8069' : ''}${relativePath}${url.search}${url.hash}`,
  )
}
