/** Bounded diagnostic only: never feed extreme names to the running app. */
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { namesAreSimilar } from '../../src/ingest/taxonomy'
for (const length of [1000, 2000, 4000, 8000]) {
  const a = 'a' + 'x'.repeat(length - 1)
  const b = 'b' + 'x'.repeat(length - 1)
  const start = performance.now()
  const result = namesAreSimilar(a, b)
  const ms = performance.now() - start
  assert.equal(result, true)
  console.log(
    JSON.stringify({
      inputCharactersEach: length,
      elapsedMs: Math.round(ms * 100) / 100,
      similar: result,
    }),
  )
}
