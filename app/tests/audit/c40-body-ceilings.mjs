// Honest Content-Length ceiling probes. Sends controlled multipart bodies; the handler must reject
// from headers before parsing the content.
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'

const fixturePath = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(process.env.E2E_BASE_URL, 'http://app:3000')
assert(fixturePath && output)
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
let token
const results = []
let failure

async function login() {
  const response = await fetch('http://app:3000/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.accounts.siteAdmin.email, password: fixture.password }),
  })
  assert.equal(response.status, 200)
  token = (await response.json()).token
}

async function oversizedMultipart(totalLength) {
  const form = new FormData()
  form.set('data', '{}')
  const encoded = new Request('http://app/', { method: 'POST', body: form })
  const body = Buffer.from(await encoded.arrayBuffer())
  const padding = totalLength - body.length
  assert(padding >= 2)
  return {
    contentType: encoded.headers.get('content-type'),
    body: Buffer.concat([
      body.subarray(0, body.length - 2),
      Buffer.alloc(padding),
      body.subarray(-2),
    ]),
  }
}

function declaredCeiling(
  route,
  length,
  label,
  body,
  contentType = 'multipart/form-data; boundary=audit-boundary',
) {
  return new Promise((resolve, reject) => {
    let responseSeen = false
    const request = http.request(
      {
        hostname: 'app',
        port: 3000,
        path: route,
        method: 'POST',
        agent: false,
        headers: {
          Authorization: `JWT ${token}`,
          'Content-Type': contentType,
          'Content-Length': String(length),
        },
      },
      (response) => {
        // A pre-parse 413 can close the connection while the client is still writing the
        // deliberately oversized body. Record the status as soon as headers arrive and ignore the
        // resulting ECONNRESET/aborted event; waiting for `end` would turn a successful guard into
        // a false probe failure.
        responseSeen = true
        results.push({ label, route, declaredLength: length, status: response.statusCode })
        response.resume()
        response.on('end', () => {
          resolve()
        })
      },
    )
    request.setTimeout(10000, () =>
      request.destroy(new Error(`${label}: timed out waiting for header rejection`)),
    )
    request.on('error', (error) => {
      if (!responseSeen) reject(error)
    })
    // The upload case sends one byte against an oversized declared length; the preview/save cases
    // send valid multipart framing. A correct pre-parse guard returns before formData/json reads.
    request.end(body)
  })
}

try {
  await login()
  await declaredCeiling(
    '/api/lesson-plans/upload',
    201 * 1024 * 1024,
    'upload-body-cap',
    Buffer.alloc(1),
  )
  const oversizedForm = await oversizedMultipart(5 * 1024 * 1024)
  await declaredCeiling(
    `/api/lesson-bundle-versions/${fixture.plans.A.version}/preview`,
    5 * 1024 * 1024,
    'preview-body-cap',
    oversizedForm.body,
    oversizedForm.contentType,
  )
  await declaredCeiling(
    `/api/lesson-bundle-versions/${fixture.plans.A.version}/save-as-new`,
    5 * 1024 * 1024,
    'save-body-cap',
    oversizedForm.body,
    oversizedForm.contentType,
  )
  for (const result of results) assert.equal(result.status, 413, result.label)
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
}
await writeFile(output, JSON.stringify({ results, failure }, null, 2), { mode: 0o600 })
console.log(
  JSON.stringify({
    results: results.map(({ label, status }) => ({ label, status })),
    passed: !failure,
  }),
)
if (failure) {
  console.error(failure)
  process.exitCode = 1
}
