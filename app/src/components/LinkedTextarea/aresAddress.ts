/** Public installation addresses only; no network requests or document-time rewriting. */
export type AresAddresses = { siteUrl?: string; kolibriUrl?: string; aliases?: string[] }

const parse = (value: string): URL | null => {
  try {
    if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

/** Unknown sites and malformed wrappers retain exactly the address the teacher supplied. */
export function normalizeAresAddress(value: string, settings: AresAddresses = {}): string {
  const site = settings.siteUrl && parse(settings.siteUrl)
  const kolibri = settings.kolibriUrl && parse(settings.kolibriUrl)
  const hosts = new Set(['ares.local', 'demo.aresedu.dev'])
  for (const host of [
    site && site.hostname,
    kolibri && kolibri.hostname,
    ...(settings.aliases ?? []),
  ]) {
    if (host) hosts.add(host.toLowerCase())
  }
  const normalize = (address: string, depth: number): string => {
    const url = parse(address)
    if (!url || !hosts.has(url.hostname.toLowerCase())) return address
    if (/^\/tracker\/(local|external)_launch\.html$/.test(url.pathname)) {
      if (depth >= 4) return address
      const target = url.searchParams.get('target')
      if (!target) return address
      if (url.pathname.endsWith('/local_launch.html')) {
        // A local target must be a path, never a protocol-relative host or backslash escape.
        if (!target.startsWith('/') || target.startsWith('//') || /[\\\r\n]/.test(target))
          return address
        return normalize(new URL(target, url.origin).href, depth + 1)
      }
      return parse(target) ? normalize(target, depth + 1) : address
    }
    const configuredPrefix = kolibri ? kolibri.pathname.replace(/\/$/, '') : ''
    const prefix =
      kolibri &&
      url.hostname === kolibri.hostname &&
      configuredPrefix &&
      (url.pathname === configuredPrefix || url.pathname.startsWith(`${configuredPrefix}/`))
        ? configuredPrefix
        : url.pathname === '/kolibri' || url.pathname.startsWith('/kolibri/')
          ? '/kolibri'
          : ''
    const isKolibri =
      url.port === '8069' ||
      !!prefix ||
      !!(
        kolibri &&
        url.hostname === kolibri.hostname &&
        url.port === kolibri.port &&
        !configuredPrefix
      )
    return `http://ares.local${isKolibri ? ':8069' : ''}${url.pathname.slice(prefix.length) || '/'}${url.search}${url.hash}`
  }
  return normalize(value, 0)
}
