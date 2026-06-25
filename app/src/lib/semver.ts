/**
 * Minimal semver bump (SPEC §6). Mirrors the helper inside `hooks/bundleIntegrity.ts`; lives here so
 * the version fork endpoint can reuse it without importing the bundle-integrity module.
 */
export const bumpSemver = (current: string | null | undefined, bump: 'major' | 'minor' | 'patch' = 'patch'): string => {
  const [major = 1, minor = 0, patch = 0] = (current ?? '1.0.0').split('.').map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}
