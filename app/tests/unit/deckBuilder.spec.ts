import Ajv from 'ajv'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'

import { buildDeck } from '../../src/decks'
import schema from '../../src/decks/vendor/config/deck_spec.schema.json'
import bundle from '../../src/decks/vendor/fixtures/Biology_Cell_Structure_data.json'
import manifest from '../../src/decks/vendor/fixtures/L1.manifest.json'
import spec from '../../src/decks/vendor/fixtures/L1.spec.json'

afterEach(() => vi.unstubAllEnvs())

it('validates the merged pilot spec against the upstream authoring schema', () => {
  const a = schema.authoring_call_A
  const b = schema.authoring_call_B
  const blocks = a.properties.slides.items.properties.blocks
  const notes = { $ref: '#/$defs/notes' }
  const timedWithNotes = (
    section: typeof b.properties.safety | typeof b.properties.summary,
    minutes: typeof a.properties.safety_minutes,
  ) => ({
    ...section,
    properties: { ...section.properties, minutes, notes },
    required: [...section.required, 'minutes', 'notes'],
  })

  // The authoring merge moves minutes and notes into the rendered sections. The pilot
  // omits figure coverage and only figure blocks need a figure id in the builder input.
  const { safety_minutes: safetyMinutes, summary_minutes: summaryMinutes, ...partA } = a.properties
  const { fixed_notes: _fixedNotes, ...partB } = b.properties
  const validate = new Ajv({ allErrors: true }).compile({
    type: 'object',
    $defs: a.$defs,
    properties: {
      ...partA,
      ...partB,
      slides: {
        ...a.properties.slides,
        items: {
          ...a.properties.slides.items,
          properties: {
            ...a.properties.slides.items.properties,
            blocks: {
              ...blocks,
              items: {
                ...blocks.items,
                required: blocks.items.required.filter((key) => key !== 'figure'),
                if: { properties: { type: { const: 'figure' } } },
                then: { required: ['figure'] },
              },
            },
          },
        },
      },
      safety: timedWithNotes(b.properties.safety, safetyMinutes),
      summary: timedWithNotes(b.properties.summary, summaryMinutes),
      unit_map_notes: notes,
      goals_notes: notes,
    },
    required: [
      ...new Set([
        ...a.required.filter(
          (key) => !['safety_minutes', 'summary_minutes', 'figure_coverage'].includes(key),
        ),
        ...b.required.filter((key) => key !== 'fixed_notes'),
        'unit_map_notes',
        'goals_notes',
      ]),
    ],
    additionalProperties: false,
  })
  expect(validate(spec), JSON.stringify(validate.errors)).toBe(true)
})

it('renders the pilot slide count and titles in order with placeholder art', async () => {
  vi.stubEnv('DECK_ALLOW_MISSING_ART', '1')
  const lessonNumber = manifest.lesson
  const deck = await JSZip.loadAsync(await buildDeck(spec, bundle, lessonNumber))
  const files = deck.file(/^ppt\/slides\/slide\d+\.xml$/)
  const titles = [
    spec.lesson_title_short,
    'How these lessons work: one routine, five phases',
    `Lesson ${lessonNumber} at a glance`,
    `ARES resources for Lesson ${lessonNumber}`,
    'Where we are in the unit',
    'By the end of this lesson you can…',
    ...spec.slides.map(({ title }) => title),
    `Summary Table: Lesson ${lessonNumber}`,
  ]
  expect(files).toHaveLength(manifest.slideCount)
  expect(files).toHaveLength(titles.length)

  const { window } = new JSDOM()
  try {
    const parser = new window.DOMParser()
    for (const [index, title] of titles.entries()) {
      const xml = await deck.file(`ppt/slides/slide${index + 1}.xml`)!.async('string')
      const slide = parser.parseFromString(xml, 'application/xml')
      const text = Array.from(slide.getElementsByTagName('a:t'), (node) => node.textContent)
      expect(text, `Slide ${index + 1}`).toContain(title)
      if (index === 0) {
        expect(text).toContain(`[illustration: ${spec.hero.art_id}]`)
        const pictures = Array.from(slide.getElementsByTagName('p:pic'))
        const altText = pictures.map((pic) =>
          pic.getElementsByTagName('p:cNvPr')[0]?.getAttribute('descr'),
        )
        expect(altText).toContain(spec.hero.alt)
      }
    }
  } finally {
    window.close()
  }
}, 20_000)
