/** Release tags are baked into published images; source deployments identify their exact commit. */
export function appVersionLabel(version: string | undefined): string {
  if (version === 'development') return 'Development build'
  if (!version) return 'Version unavailable'
  if (/^v\d+\.\d+(?:\.\d+)?$/.test(version)) return `Version ${version.slice(1)}`
  if (/^build-[a-f0-9]{7,40}$/.test(version)) return `Build ${version.slice(6)}`
  return 'Version unavailable'
}
