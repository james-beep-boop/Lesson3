import { withDeadline } from '../EditRecovery/deadline'

/** Only a confirmed missing parent may change the editing session's provenance. */
export async function missingCombineParent(
  sourceId: string | number,
  otherId: number,
): Promise<'source' | 'other' | null> {
  try {
    return await withDeadline(15_000, async (signal) => {
      const [source, other] = await Promise.all(
        [sourceId, otherId].map((id) =>
          fetch(`/api/lesson-bundle-versions/${id}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal,
          }),
        ),
      )
      if (source.status === 404) return 'source'
      if (source.ok && other.status === 404) return 'other'
      return null
    })
  } catch {
    return null
  }
}
