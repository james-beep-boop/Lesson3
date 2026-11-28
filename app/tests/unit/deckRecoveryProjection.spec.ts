import { expect, it } from 'vitest'

import { applyCapture, captureAnchors, projectCapture } from '../../src/lib/editRecovery/projection'
import { deckSeries } from '../../src/lib/versionSeries'

it('restores deck prose by row ID and preserves the live structure', () => {
  const collection = deckSeries.versions
  const first = {
    id: 'one',
    title: 'First slide',
    phase: 'observe',
    notes: { say: [{ id: 'note', value: 'Read this' }] },
  }
  const second = { id: 'two', title: 'Second slide' }
  const editedNotes = { say: [{ id: 'note', value: 'Look here' }] }
  const updated = {
    spec: {
      slides: [
        { ...first, title: '', phase: 'model', notes: editedNotes },
        { id: 'gone', title: 'A new slide' },
      ],
      goals: [{ id: 'goal', value: 'New goal' }],
      hero: { art_id: 'different_picture', prompt: 'A private prompt' },
    },
  }
  const current = {
    spec: {
      slides: [second, first],
      goals: [{ id: 'goal', value: 'Old goal' }],
      hero: { art_id: 'original_picture' },
    },
  }
  const capture = projectCapture(updated, collection)
  expect(capture).toEqual({
    'deck.slides:one': { title: '' },
    'deck.slides.notes.say:note': { value: 'Look here' },
    'deck.slides:gone': { title: 'A new slide' },
    'deck.goals:goal': { value: 'New goal' },
  })
  expect(captureAnchors(current, collection)).toContainEqual({
    key: 'deck.slides:one',
    heading: 'Slide 2',
  })
  const { doc, report } = applyCapture(current, capture, collection)
  expect(report).toEqual({ applied: 3, droppedKeys: ['deck.slides:gone'] })
  expect(doc).toEqual({
    spec: {
      ...current.spec,
      slides: [second, { ...first, title: '', notes: editedNotes }],
      goals: [{ id: 'goal', value: 'New goal' }],
    },
  })
})
