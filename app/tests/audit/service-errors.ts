/** Local fault server only: actual Node fetch, no database or application configuration changes. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { docxToPdf, PdfConversionError } from '../../src/generator/docxToPdf'
import { collectSystemFacts } from '../../src/lib/systemFacts'
let mode: 'before headers' | 'during body' | 'complete' = 'complete'
const server = createServer((req, res) => {
  req.resume()
  if (req.url === '/health') {
    res.end('healthy')
    return
  }
  if (mode === 'before headers') return
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': mode === 'during body' ? '10000' : '14',
  })
  if (mode === 'during body') res.write('%PDF-1.4\n')
  else res.end('%PDF-1.4\n%%EOF')
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const keys = ['GOTENBERG_URL', 'GOTENBERG_TIMEOUT_MS', 'ARTIFACT_CACHE_MAX_BYTES'] as const
const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
try {
  process.env.GOTENBERG_URL = `http://127.0.0.1:${address.port}`
  process.env.GOTENBERG_TIMEOUT_MS = '150'
  const outcomes = []
  for (const next of ['complete', 'before headers', 'during body'] as const) {
    mode = next
    try {
      const bytes = await docxToPdf(Buffer.from('audit request'))
      outcomes.push({ phase: mode, returnedBytes: bytes.length, wrapped: false })
    } catch (error) {
      outcomes.push({
        phase: mode,
        errorName: error instanceof Error ? error.name : 'unknown',
        wrapped: error instanceof PdfConversionError,
      })
    }
  }
  assert.equal(outcomes[0].returnedBytes, 14, 'Complete local response is consumed')
  assert.equal(outcomes[1].wrapped, true, 'Header-wait timeout is correctly classified')
  mode = 'complete'
  process.env.ARTIFACT_CACHE_MAX_BYTES = 'invalid-audit-setting'
  let factsResolved = false
  let factsError: string | undefined
  try {
    await collectSystemFacts()
    factsResolved = true
  } catch (error) {
    factsError = error instanceof Error ? error.message : 'unknown'
  }
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      conversion: outcomes,
      invalidCacheSetting: { factsResolved, error: factsError },
      limits:
        'Fault server and environment belong only to this isolated probe process; running app untouched',
    }),
  )
  assert.equal(
    outcomes[2].wrapped,
    true,
    'Response-body timeout must keep the conversion-error classification',
  )
  assert.equal(
    factsResolved,
    true,
    'System facts promise must preserve its never-throws contract for a bad cache setting',
  )
} finally {
  for (const key of keys) {
    if (prior[key] === undefined) delete process.env[key]
    else process.env[key] = prior[key]
  }
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}
process.exit(0)
