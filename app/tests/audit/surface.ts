import configPromise from '../../src/payload.config.js'
const config = await configPromise
const named = (x: unknown) => (typeof x === 'function' ? x.name || '(anonymous)' : typeof x)
console.log(
  JSON.stringify(
    {
      collections: config.collections.map((c) => ({
        slug: c.slug,
        access: Object.fromEntries(Object.entries(c.access).map(([k, v]) => [k, named(v)])),
        endpoints: (c.endpoints || []).map((e) => ({ method: e.method, path: e.path })),
        hooks: Object.fromEntries(
          Object.entries(c.hooks || {}).map(([k, v]) => [k, (v as unknown[]).map(named)]),
        ),
      })),
      globals: config.globals.map((g) => ({
        slug: g.slug,
        access: Object.fromEntries(Object.entries(g.access).map(([k, v]) => [k, named(v)])),
      })),
      endpoints: config.endpoints.map((e) => ({ method: e.method, path: e.path })),
      graphqlDisabled: config.graphQL.disable,
    },
    null,
    2,
  ),
)
