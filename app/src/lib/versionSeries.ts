/** Identity and storage shared by the version workflows for plans and decks. */
export const planSeries = {
  parent: 'lesson-plans',
  versions: 'lesson-bundle-versions',
  parentKey: 'lessonPlan',
  table: 'lesson_plans',
  label: 'lesson plan',
  semverIndex: 'lessonPlan_semver_idx',
} as const

export const deckSeries = {
  parent: 'decks',
  versions: 'deck-versions',
  parentKey: 'deck',
  table: 'decks',
  label: 'deck',
  semverIndex: 'deck_semver_idx',
} as const

export type VersionSeries = typeof planSeries | typeof deckSeries
