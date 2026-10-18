import { expect, it } from 'vitest'
import { includedVersion } from '../../src/lib/combine/outcome'
import { planCombine } from '../../src/lib/combine/engine'

it('recognizes an included ancestor after applying a nonempty overlay', () => {
  const a = { id: 1, lessons: [{ id: 'old', title: 'Lesson', overview: 'old' }] }
  const b = { id: 2, lessons: [{ id: 'new', title: 'Lesson', overview: 'new' }] }
  const plan = planCombine({ a, b, base: a })
  expect(plan.ok).toBe(true)
  expect(includedVersion({ a, b, base: a, plan })).toBe('b')
  expect(includedVersion({ a, b, base: null, plan })).toBeNull()
  if (plan.ok) expect(includedVersion({ a, b, base: a, plan: { ...plan, overlay: {} } })).toBeNull()
})
