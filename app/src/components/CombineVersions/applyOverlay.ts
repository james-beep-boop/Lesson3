import { captureFieldPath, type CaptureMap } from '../../lib/editRecovery/projection'

/** Validate the entire prose overlay before changing native form fields. No form-state RPC. */
export function combineFieldUpdates(
  document: Record<string, unknown>,
  overlay: CaptureMap,
): { path: string; value: string | null }[] {
  return Object.entries(overlay).flatMap(([key, fields]) =>
    Object.entries(fields).map(([field, value]) => {
      const path = captureFieldPath(document, key, field)
      if (!path) throw new Error('The combination cannot be applied to these fields.')
      return { path, value }
    }),
  )
}
