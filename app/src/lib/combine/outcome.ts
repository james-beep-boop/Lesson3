import type { LessonBundleVersion } from '../../payload-types'
import { applyCapture } from '../editRecovery/projection'
import { comparableContent } from '../versionContent'
import type { CombinePlan } from './engine'

/** Ancestry alone is insufficient: prove that the result equals the descendant's content. */
export function includedVersion({
  a,
  b,
  base,
  plan,
}: {
  a: Record<string, unknown> | LessonBundleVersion
  b: Record<string, unknown> | LessonBundleVersion
  base: Record<string, unknown> | LessonBundleVersion | null
  plan: CombinePlan
}): 'a' | 'b' | null {
  if (!plan.ok || plan.conflicts.length || !base) return null
  const descendant = base.id === a.id ? 'b' : base.id === b.id ? 'a' : null
  if (!descendant) return null
  const result = applyCapture(
    (plan.start === 'a' ? a : b) as unknown as Record<string, unknown>,
    plan.overlay,
  ).doc
  return comparableContent(result) ===
    comparableContent((descendant === 'a' ? a : b) as unknown as Record<string, unknown>)
    ? descendant
    : null
}
