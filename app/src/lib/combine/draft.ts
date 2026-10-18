import { relId } from '../relId'

/** Bounded, private recovery metadata; never exported or treated as version content. */
export type CombineContext = { mergeParent: number; resolvedKeys: string[] }
export const MAX_COMBINE_CONTEXT_BYTES = 64 * 1024
export const conflictKey = (conflict: { key: string; field: string }): string =>
  JSON.stringify([conflict.key, conflict.field])

export function parseCombineContext(value: unknown): CombineContext | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Combine draft metadata.')
  const row = value as Record<string, unknown>
  if (
    Object.keys(row).some((key) => key !== 'mergeParent' && key !== 'resolvedKeys') ||
    // A JSON number only (never a digit string), in the schema's id range — `relId` owns that range.
    typeof row.mergeParent !== 'number' ||
    relId(row.mergeParent) === null ||
    !Array.isArray(row.resolvedKeys) ||
    row.resolvedKeys.length > 1000 ||
    row.resolvedKeys.some(
      (key) =>
        typeof key !== 'string' ||
        key.length > 512 ||
        key.includes('\u0000') ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(key),
    ) ||
    new TextEncoder().encode(JSON.stringify(value)).length > MAX_COMBINE_CONTEXT_BYTES
  ) {
    throw new Error('Invalid Combine draft metadata.')
  }
  return {
    mergeParent: Number(row.mergeParent),
    resolvedKeys: [...new Set(row.resolvedKeys as string[])],
  }
}
