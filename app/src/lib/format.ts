import type { LessonSequenceFormat } from '../generator'

/**
 * The "Include ARES Resources" checkbox ↔ LessonSequence format mapping, in ONE place so the three
 * controls that use it (the teacher view toggle, the admin export, the admin preview) can't drift
 * or silently invert. Checked = `standard` (the Resource column is present); unchecked = `compact`.
 */
export const formatFromResources = (includeResources: boolean): LessonSequenceFormat =>
  includeResources ? 'standard' : 'compact'

export const resourcesIncluded = (format: LessonSequenceFormat): boolean => format === 'standard'
