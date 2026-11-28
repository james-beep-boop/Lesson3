import Ajv from 'ajv'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'

import { buildDeck } from '../../src/decks'
import { deckSpecErrors, deckSpecSchema } from '../../src/decks/spec'
import { readDeckSpec, storeDeckSpec } from '../../src/decks/storage'
import bundle from '../../src/decks/vendor/fixtures/Biology_Cell_Structure_data.json'
import manifest from '../../src/decks/vendor/fixtures/L1.manifest.json'
import spec from '../../src/decks/vendor/fixtures/L1.spec.json'

afterEach(() => vi.unstubAllEnvs())

it('validates the merged pilot spec against the upstream authoring schema', () => {
  const validate = new Ajv({ allErrors: true }).compile(deckSpecSchema)
  expect(validate(spec), JSON.stringify(validate.errors)).toBe(true)
  expect(deckSpecErrors(spec)).toEqual([])
  expect(readDeckSpec(storeDeckSpec(spec))).toEqual(spec)
})

it('validates nested fields and quiz links before accepting a deck', () => {
  const first = spec.slides[0]
  expect(deckSpecErrors({ ...spec, slides: [{ ...first, minutes: '4', phase: 'intro' }] })).toEqual(
    expect.arrayContaining([expect.stringContaining('.minutes'), expect.stringContaining('.phase')]),
  )
  expect(deckSpecErrors({ ...spec, slides: [{ ...first, quiz_links: ['file:///test'] }] })).toEqual([
    'slides[0].quiz_links: use only HTTP or HTTPS links',
  ])
  expect(
    deckSpecErrors({ ...spec, slides: [{ ...first, quiz_links: ['https://quiz.example/lesson1'] }] }),
  ).toEqual([])
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
