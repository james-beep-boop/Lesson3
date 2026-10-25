/** Resolve endpoint factories from pinned Payload config without booting the database or jobs. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import config from '../../src/payload.config'

const output = process.env.LESSON3_AUDIT_SURFACE_FILE
assert(output, 'Private inventory output file required')
const resolved = await config
const endpoints = (items: unknown) =>
  Array.isArray(items)
    ? items.map((item) => ({
        path: item.path,
        method: item.method,
        handler: item.handler?.name || '(anonymous)',
      }))
    : []
const guards = (access: unknown) =>
  Object.fromEntries(
    Object.entries((access ?? {}) as Record<string, unknown>).map(([operation, value]) => [
      operation,
      typeof value === 'function' ? value.name || '(anonymous)' : typeof value,
    ]),
  )
const inventory = {
  collections: (resolved.collections ?? []).map((collection) => ({
    slug: collection.slug,
    auth: Boolean(collection.auth),
    versions: Boolean(collection.versions),
    access: guards(collection.access),
    endpoints: endpoints(collection.endpoints),
  })),
  globals: (resolved.globals ?? []).map((global) => ({
    slug: global.slug,
    access: guards(global.access),
    endpoints: endpoints(global.endpoints),
  })),
  rootEndpoints: endpoints(resolved.endpoints),
  tasks: (resolved.jobs?.tasks ?? []).map((task) => ({ slug: task.slug, retries: task.retries })),
  jobAccess: guards(resolved.jobs?.access),
  graphQLDisabled: resolved.graphQL?.disable === true,
}
await writeFile(output, JSON.stringify(inventory, null, 2), { mode: 0o600 })
console.log(
  JSON.stringify({
    collections: inventory.collections.length,
    globals: inventory.globals.length,
    rootEndpoints: inventory.rootEndpoints.length,
    tasks: inventory.tasks.length,
    graphQLDisabled: inventory.graphQLDisabled,
  }),
)
