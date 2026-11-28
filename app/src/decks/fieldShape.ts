import type { Schema } from '../ingest/contract'
import { deckSchemaNode } from './spec'

type Visibility = 'prose' | 'structure' | 'system'

export const blocksPath = 'slides.blocks'
const prose = new Set([
  'lesson_title_short',
  'lesson_oneliner',
  'purpose.value',
  'before_class.value',
  'do_not_show.value',
  'so_far',
  'unit_map_titles.value',
  'goals.value',
  'key_words.word',
  'key_words.definition',
  'hero.alt',
  'slides.title',
  'slides.subtitle',
  'slides.time_note',
  'slides.blocks.text',
  'slides.blocks.items.value',
  'slides.blocks.rows.cells.value',
  'safety.title',
  'safety.rules.value',
  'glance.rows.what',
  'glance.materials.value',
  'glance.fallback',
  'glance.resource_notes.note',
  'summary.observe_prompt',
  'summary.learn_prompt',
  'summary.explain_prompt',
  'summary.next_lesson',
  'summary.reflection.value',
])
const notesProse = new Set([
  'do.value',
  'say.value',
  'wait_time',
  'look_for.value',
  'if_then.value',
  'why_this_works',
  'science_note',
])
const systemFields = new Set([
  'build_log',
  'figure_coverage',
  'hero.prompt',
  'slides.blocks.art_prompt',
])

export function visibility(path: string): Visibility {
  if (systemFields.has(path)) return 'system'
  const notesLeaf = /(?:^|\.)(?:notes|\w+_notes)\.(.+)$/.exec(path)?.[1]
  return prose.has(path) || (notesLeaf != null && notesProse.has(notesLeaf)) ? 'prose' : 'structure'
}

export function rowSchema(items: Schema): { name?: string; schema: Schema } {
  const node = deckSchemaNode(items)
  if (node.type === 'object') return { schema: node }
  const name = node.type === 'array' ? 'cells' : 'value'
  return { name, schema: { type: 'object', properties: { [name]: node }, required: [name] } }
}

/** Payload reserves `id` for its own array row identity. */
export const nativeName = (key: string) => (key === 'id' ? 'figure_id' : key)
const stringNode: Schema = { type: 'string' }

export function nativeProperties(schema: Schema, path: string): Record<string, Schema> {
  const properties = deckSchemaNode(schema).properties ?? {}
  return path === blocksPath
    ? { ...properties, art_id: stringNode, art_prompt: stringNode }
    : properties
}
