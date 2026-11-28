import type { Field } from 'payload'

import { canEditProse, canEditStructure, systemOnly } from '../access/bundle'
import {
  guardRowOrder,
  overlayRows,
  submittedGroup,
  type FieldSplitDoc,
  type FieldSplitPolicy,
} from '../hooks/fieldSplit'
import type { Schema } from '../ingest/contract'
import { isObject } from '../ingest/resourceLinks'
import { deckSchemaNode, deckSpecErrors, deckSpecSchema } from './spec'
import { blocksPath, nativeName, nativeProperties, rowSchema, visibility } from './fieldShape'
import icons from './vendor/generators/presentations/assets/emoji/catalogue.json'

type Doc = FieldSplitDoc

function nativeFields(schema: Schema, parent = ''): Field[] {
  return Object.entries(nativeProperties(schema, parent)).map(([key, unresolved]): Field => {
    const name = nativeName(key)
    const path = parent ? `${parent}.${key}` : key
    const node = deckSchemaNode(unresolved)
    const role = visibility(path)
    const hidden =
      role === 'system'
        ? {
            // Payload otherwise puts an empty array back after denying read access.
            hidden: true,
            admin: { hidden: true },
            access: { read: systemOnly, create: systemOnly, update: systemOnly },
          }
        : {}
    if (node.type === 'array') {
      return {
        name,
        type: 'array',
        ...(path === 'slides' ? { labels: { singular: 'Slide', plural: 'Slides' } } : {}),
        admin: { initCollapsed: true },
        fields: nativeFields(rowSchema(node.items!).schema, path),
        ...hidden,
      }
    }
    if (node.type === 'object') return { name, type: 'group', fields: nativeFields(node, path) }
    const field = {
      name,
      access: { update: role === 'prose' ? canEditProse : canEditStructure },
      ...hidden,
    }
    if (node.enum) return { ...field, type: 'select', options: node.enum.map(String) }
    if (node.type === 'integer') return { ...field, type: 'number' }
    if (node.type === 'boolean') return { ...field, type: 'checkbox' }
    if (node.type !== 'string') throw new Error(`Cannot store deck field ${path}: ${node.type}`)
    if (role === 'structure') return { ...field, type: 'text' }
    return { ...field, type: 'textarea' }
  })
}

export const deckSpecFields = nativeFields(deckSpecSchema)

/** Translate primitive arrays and packed illustration fields to and from native rows. */
function translate(
  value: unknown,
  schema: Schema,
  direction: 'store' | 'read',
  path = '',
): unknown {
  const node = deckSchemaNode(schema)
  if (node.type === 'array' && Array.isArray(value)) {
    const { name, schema: row } = rowSchema(node.items!)
    return value.map((item) => {
      if (direction === 'store') {
        return translate(name ? { [name]: item } : item, row, direction, path)
      }
      const decoded = translate(item, row, direction, path)
      return name && isObject(decoded) ? decoded[name] : decoded
    })
  }
  if (node.type !== 'object' || !isObject(value)) return value

  const out: Doc = {}
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const storedKey = nativeName(key)
    const required = node.required?.includes(key)
    const childPath = path ? `${path}.${key}` : key
    const childNode = deckSchemaNode(child)
    let raw = value[direction === 'store' ? key : storedKey]
    if (direction === 'read') {
      if (childNode.type === 'array' && (raw === 0 || raw == null)) raw = []
      if (!required && (raw == null || (Array.isArray(raw) && !raw.length))) continue
      if (required && childNode.type === 'string' && !childNode.enum && raw == null) raw = ''
    }
    if (raw !== undefined) {
      out[direction === 'store' ? storedKey : key] = translate(raw, child, direction, childPath)
    }
  }

  if (path === blocksPath && value.type === 'illustration') {
    if (direction === 'store') {
      const [artId, prompt] = value.items as string[]
      out.items = []
      out.art_id = artId
      if (prompt !== undefined) out.art_prompt = prompt
    } else {
      out.items = value.art_prompt == null ? [value.art_id] : [value.art_id, value.art_prompt]
    }
  }
  return out
}

export const storeDeckSpec = (spec: Record<string, unknown>): Doc =>
  translate(spec, deckSpecSchema, 'store') as Doc

export const readDeckSpec = (spec: unknown): unknown => translate(spec, deckSpecSchema, 'read')

export function deckFieldErrors(
  content: Record<string, unknown>,
): { message: string; path: string }[] {
  return deckSpecErrors(readDeckSpec(content.spec)).map((message) => ({ path: 'spec', message }))
}

/** Merge a partial submission and retain system fields from the corresponding stored row. */
function prepareGroup(
  data: Doc,
  source: Doc,
  schema: Schema,
  authenticated: boolean,
  path = '',
): Doc {
  const out: Doc = {}
  for (const [key, child] of Object.entries(nativeProperties(schema, path))) {
    const name = nativeName(key)
    const childPath = path ? `${path}.${key}` : key
    const node = deckSchemaNode(child)
    let value = name in data ? data[name] : source[name]
    if (authenticated && visibility(childPath) === 'system') value = source[name]
    else if (node.type === 'object' && isObject(value)) {
      value = prepareGroup(value, asDoc(source[name]), node, authenticated, childPath)
    } else if (node.type === 'array') {
      if (value === 0) value = []
      if (Array.isArray(value)) {
        const previous = Array.isArray(source[name]) ? (source[name] as Doc[]) : []
        const byId = new Map(previous.map((row) => [row.id, row]))
        value = value.map((row: unknown) => {
          if (!isObject(row)) return row
          return {
            ...prepareGroup(
              row,
              byId.get(row.id as Doc['id']) ?? {},
              rowSchema(node.items!).schema,
              authenticated,
              childPath,
            ),
            id: row.id,
          }
        })
      }
    }
    if (value !== undefined) out[name] = value
  }
  return out
}

const asDoc = (value: unknown): Doc => (isObject(value) ? value : {})

function overlayDeckProse(
  source: Doc,
  data: Doc,
  schema: Schema,
  reject: () => never,
  path = '',
): Doc {
  const out = { ...source }
  for (const [key, child] of Object.entries(nativeProperties(schema, path))) {
    const name = nativeName(key)
    const childPath = path ? `${path}.${key}` : key
    const node = deckSchemaNode(child)
    if (!(name in data) || visibility(childPath) === 'system') continue
    if (node.type === 'object') {
      out[name] = overlayDeckProse(
        asDoc(source[name]),
        submittedGroup(data[name], reject),
        node,
        reject,
        childPath,
      )
    } else if (node.type === 'array') {
      const rows = guardRowOrder(source[name], data[name], reject)
      const row = rowSchema(node.items!).schema
      out[name] = overlayRows(
        source[name] as Doc[] | undefined,
        rows,
        [],
        (before, submitted, result) => {
          Object.assign(result, overlayDeckProse(before, submitted, row, reject, childPath))
        },
      )
    } else if (visibility(childPath) === 'prose') {
      out[name] = data[name]
    }
  }

  // Some builder text starts with an icon name. Preserve the artwork when editing that text.
  const iconItems = ['bullets', 'numbered', 'tiles', 'columns'].includes(String(source.type))
  if (path === blocksPath && iconItems && Array.isArray(out.items)) {
    const previous = source.items as Doc[]
    out.items = (out.items as Doc[]).map((row, index) => ({
      ...row,
      value: preserveIcon(previous[index]?.value, row.value),
    }))
  }
  if (path === blocksPath && source.type === 'callout') {
    out.text = preserveIcon(source.text, out.text)
  }
  return out
}

function preserveIcon(before: unknown, edited: unknown): unknown {
  if (typeof before !== 'string' || typeof edited !== 'string' || before === edited) return edited
  const prefix = (value: string) => {
    const match = /^\s*([a-z0-9_]+)\s*::\s*/.exec(value)
    return match && Object.hasOwn(icons, match[1]!) ? match[0] : ''
  }
  return prefix(before) + edited.slice(prefix(edited).length)
}

export const deckFieldSplit: FieldSplitPolicy = {
  prepare(data, source, authenticated) {
    const spec = data.spec === undefined ? source.spec : data.spec
    return {
      spec: isObject(spec)
        ? prepareGroup(spec, asDoc(source.spec), deckSpecSchema, authenticated)
        : spec,
      updatedAt: data.updatedAt,
    }
  },
  restrictToProse(data, source, reject) {
    return {
      spec: overlayDeckProse(
        asDoc(source.spec),
        submittedGroup(data.spec, reject),
        deckSpecSchema,
        reject,
      ),
      updatedAt: data.updatedAt,
    }
  },
}
