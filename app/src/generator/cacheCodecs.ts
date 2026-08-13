/** Decode cached JSON only when it satisfies the caller's runtime contract. */
export function decodeCachedJson<T>(
  bytes: Buffer,
  isValue: (value: unknown) => value is T,
): T | null {
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'))
    return isValue(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const isStringRecord = (value: unknown, keys: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  keys.every((key) => key in value && typeof (value as Record<string, unknown>)[key] === 'string')
