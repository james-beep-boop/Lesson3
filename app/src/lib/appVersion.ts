/** `v1.08` → `1.08`; anything that is not a release tag → undefined. */
export function releaseTagVersion(version: string | undefined): string | undefined {
  return version && /^v\d+\.\d+(?:\.\d+)?$/.test(version) ? version.slice(1) : undefined
}

/** Release tags are baked into published images; source deployments identify their exact commit. */
export function appVersionLabel(version: string | undefined): string {
  if (version === 'development') return 'Development build'
  if (!version) return 'Version unavailable'
  const release = releaseTagVersion(version)
  if (release) return `Version ${release}`
  if (/^build-[a-f0-9]{7,40}$/.test(version)) return `Build ${version.slice(6)}`
  return 'Version unavailable'
}

/**
 * The raw version this server runs, for {@link appVersionLabel}. The ONE place the environment is
 * read, so the sign-in page, the Guide footer and the account menu cannot disagree. Server-only by
 * use: on a client `process.env.APP_RELEASE_VERSION` is not inlined, so call it in a server component
 * and pass the finished label down.
 */
export function currentAppVersion(): string | undefined {
  return (
    process.env.APP_RELEASE_VERSION ??
    (process.env.NODE_ENV === 'development' ? 'development' : undefined)
  )
}
