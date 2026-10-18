import { expect, it } from 'vitest'
import { captureFieldPath } from '../../src/lib/editRecovery/projection'

const doc = {
  lessons: [{ id: 'first' }, { id: 'second', framework: [{ id: 'phase' }] }],
  finalExplanation: { sections: [{ id: 'section' }] },
  summaryTable: { lessons: [{ id: 'summary' }] },
}
it('locates each allowed prose scope by row identity in the current form', () => {
  for (const [key, field, path] of [
    ['lesson:second', 'overview', 'lessons.1.overview'],
    ['slo:second', 'knowledge', 'lessons.1.slo.knowledge'],
    ['prompt:second', 'observed', 'lessons.1.summaryTablePrompt.observed'],
    ['framework:phase', 'teacherMoves', 'lessons.1.framework.0.teacherMoves'],
    ['finalExplanation', 'instructions', 'finalExplanation.instructions'],
    ['section:section', 'prompt', 'finalExplanation.sections.0.prompt'],
    ['summaryLesson:summary', 'learned', 'summaryTable.lessons.0.learned'],
  ])
    expect(captureFieldPath(doc, key, field)).toBe(path)
})
it('does not map unknown rows, prototype keys or administrator fields into form writes', () => {
  for (const [key, field] of [
    ['lesson:gone', 'overview'],
    ['toString', 'overview'],
    ['lesson:second', 'duration'],
    ['framework:phase', 'phase'],
    ['summaryLesson:summary', 'title'],
  ]) {
    expect(captureFieldPath(doc, key, field)).toBeNull()
  }
})

it('validates the whole overlay before returning any form updates', async () => {
  const { combineFieldUpdates } = await import('../../src/components/CombineVersions/applyOverlay')
  expect(combineFieldUpdates(doc, { 'lesson:second': { overview: 'New prose' } })).toEqual([
    { path: 'lessons.1.overview', value: 'New prose' },
  ])
  expect(() =>
    combineFieldUpdates(doc, { 'lesson:second': { overview: 'New prose', duration: 'not prose' } }),
  ).toThrow()
})
