import { parseExternalUrl } from './insertLink'

/** Public installation bases only; no network requests or document-time rewriting. */
export type AresAddresses = { siteUrl?: string; kolibriUrl?: string; aliases?: string[] }

type AresBase = { origin: string; prefix: string; kolibri: boolean }

/**
 * Kolibri appends its own navigation state to the address a teacher copies from the address bar
 * (`…#/topics/c/<id>?prevName=…&prevQuery=…`), which Lesson3 does not need and which makes the link
 * very long. Mark's rule (ARES, 2026-10-20): remove `?prevName=` and everything after it, leaving the
 * rest intact. Kolibri addresses only, until ARES says it applies more widely.
 */
const KOLIBRI_NAVIGATION = '?prevName='
export const withoutKolibriNavigation = (address: string): string => {
  const at = address.indexOf(KOLIBRI_NAVIGATION)
  return at === -1 ? address : address.slice(0, at)
}

/** Match an origin and a whole path prefix; a shared hostname alone grants no match. */
export function normalizeAresAddress(value: string | URL, settings: AresAddresses = {}): string {
  const bases: AresBase[] = []
  const add = (address: string | undefined, kolibri: boolean) => {
    const url = address && parseExternalUrl(address)
    if (url) bases.push({ origin: url.origin, prefix: url.pathname.replace(/\/$/, ''), kolibri })
  }
  for (const protocol of ['http:', 'https:']) {
    add(`${protocol}//ares.local`, false)
    add(`${protocol}//ares.local:8069`, true)
    // An address copied on the ARES machine itself (Mark, ARES, 2026-10-20): same content, but only
    // reachable from that machine, so it is stored as `ares.local` like every other ARES link.
    add(`${protocol}//localhost`, false)
    add(`${protocol}//localhost:8069`, true)
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
  const match = (url: URL) =>
    bases.find(
      (base) =>
        base.origin === url.origin &&
        (url.pathname === base.prefix || url.pathname.startsWith(`${base.prefix}/`)),
    )
  const normalize = (input: string | URL, depth: number): string => {
    const address = typeof input === 'string' ? input : input.href
    const url = typeof input === 'string' ? parseExternalUrl(input) : input
    const base = url && match(url)
    if (!url || !base) return address
    const relativePath = url.pathname.slice(base.prefix.length) || '/'
    if (/^\/tracker\/(local|external)_launch\.html$/.test(relativePath)) {
      if (depth >= 4) return address
      const target = url.searchParams.get('target')
      if (!target) return address
      if (relativePath.endsWith('/local_launch.html')) {
        if (!target.startsWith('/') || target.startsWith('//') || /[\\\r\n\t]/.test(target))
          return address
        const resolved = new URL(target, url.origin)
        // URL resolution can interpret a path as a new authority (including after control stripping).
        // Check the result, not just the supplied characters; also retain the configured path scope.
        if (resolved.origin !== url.origin || !match(resolved)) return address
        return normalize(resolved, depth + 1)
      }
      const external = parseExternalUrl(target)
      return external ? normalize(external, depth + 1) : address
    }
    const stored = `http://ares.local${base.kolibri ? ':8069' : ''}${relativePath}${url.search}${url.hash}`
    return base.kolibri ? withoutKolibriNavigation(stored) : stored
  }
  return normalize(value, 0)
}
