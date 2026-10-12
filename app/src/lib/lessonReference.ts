/** The saved-version label and display shape shared by Messages and Discussions. Client-safe. */
import { lessonDisplayName } from './substrand'

export interface ReferenceView {
  label: string
  /** Null when the referenced version is gone or not readable; never fall back to Official. */
  lessonHref: string | null
  /** Only present when both the version and its recorded source are readable. */
  compareHref: string | null
}

export const versionReferenceLabel = (version: {
  meta?: { substrand_name?: string | null } | null
  title?: string | null
  semver?: string | null
}): string =>
  `${lessonDisplayName(version.meta?.substrand_name, version.title)} · v${version.semver ?? '?'}`
