/**
 * Up-to-two-letter initials for an avatar, from a display name (or email as a fallback). Two words
 * → first + last initial; one word → its first two letters; empty → "?". Always uppercase.
 */
export function initials(nameOrEmail: string): string {
  const name = (nameOrEmail ?? '').trim()
  if (!name) return '?'
  // For an email with no name, initial off the local part only.
  const base = name.includes('@') ? name.split('@')[0] : name
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
