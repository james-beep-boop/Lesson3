import { resolveNode, schemaDrift, type Schema } from '../ingest/contract'
import { isObject, isSafeHttpUrl } from '../ingest/resourceLinks'
import schema from './vendor/config/deck_spec.schema.json'

const a = schema.authoring_call_A
const b = schema.authoring_call_B
const slide = a.properties.slides.items
const block = slide.properties.blocks.items
const notes = { $ref: '#/$defs/notes' }
const strings = { type: 'array', items: { type: 'string' } }
const timedWithNotes = (
  section: typeof b.properties.safety | typeof b.properties.summary,
  minutes: typeof a.properties.safety_minutes,
) => ({
  ...section,
  properties: { ...section.properties, minutes, notes },
  required: [...section.required, 'minutes', 'notes'],
})

// Upstream publishes the two authoring calls. The merged spec moves times and notes to
// their sections. It may omit figure coverage, and only a figure block needs a figure id.
const { safety_minutes: safetyMinutes, summary_minutes: summaryMinutes, ...partA } = a.properties
const { fixed_notes: _fixedNotes, ...partB } = b.properties

export const deckSpecSchema: Schema = {
  type: 'object',
  $defs: a.$defs,
  properties: {
    ...partA,
    ...partB,
    slides: {
      ...a.properties.slides,
      items: {
        ...slide,
        properties: {
          ...slide.properties,
          quiz_links: strings,
          blocks: {
            ...slide.properties.blocks,
            items: { ...block, required: block.required.filter((key) => key !== 'figure') },
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
}

export const artIdPattern = /^[a-z0-9_]{1,120}$/i

export function deckSpecErrors(raw: unknown): string[] {
  const errors = schemaDrift(raw, deckSpecSchema)
  if (errors.length || !isObject(raw)) return errors

  const slides = raw.slides as Record<string, unknown>[]
  const hero = raw.hero as Record<string, unknown>
  if (!/^[a-z0-9_]*$/i.test(String(hero.icon))) errors.push('hero.icon: invalid icon name')
  if (hero.art_id && !artIdPattern.test(String(hero.art_id))) {
    errors.push('hero.art_id: invalid art name')
  }
  if (!(raw.lesson_title_short as string).trim()) errors.push('lesson_title_short: enter a title')
  if (!slides.length) errors.push('slides: include at least one slide')
  slides.forEach((slide, index) => {
    const path = `slides[${index}]`
    if ((slide.quiz_links as string[] | undefined)?.some((url) => !isSafeHttpUrl(url))) {
      errors.push(`${path}.quiz_links: use only HTTP or HTTPS links`)
    }
    const blocks = slide.blocks as Record<string, unknown>[]
    blocks.forEach((block, blockIndex) => {
      const pathToBlock = `${path}.blocks[${blockIndex}]`
      if (block.type === 'figure' && !block.figure) {
        errors.push(`${pathToBlock}.figure: enter a figure definition`)
      }
      if (block.type === 'illustration') {
        const [id, , ...extra] = block.items as string[]
        if (!id || !artIdPattern.test(id) || extra.length) {
          errors.push(`${pathToBlock}.items: enter an art name and optionally its authoring prompt`)
        }
      }
    })
  })
  return errors
}

export function deckArtIds(raw: Record<string, unknown>): Set<string> {
  const ids = new Set([(raw.hero as { art_id: string }).art_id])
  for (const slide of raw.slides as { blocks: { type: string; items: string[] }[] }[]) {
    for (const block of slide.blocks) if (block.type === 'illustration') ids.add(block.items[0]!)
  }
  return ids
}

export const deckSchemaNode = (node: Schema): Schema => resolveNode(node, deckSpecSchema)
