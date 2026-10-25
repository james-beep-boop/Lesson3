// Chunked-transfer probes for the application-side field ceilings. The deployment proxy is a
// separate control and must still enforce the global 201 MiB ceiling described in docs/OPS.md.
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

function postChunked(route, label, body, contentType) {
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
          // Explicitly select HTTP/1.1 chunked framing; there is intentionally no Content-Length.
          'Transfer-Encoding': 'chunked',
        },
      },
      (response) => {
        responseSeen = true
        const chunks = []
        response.on('data', (chunk) => {
          if (Buffer.byteLength(Buffer.concat(chunks)) < 4096) chunks.push(chunk)
        })
        response.on('end', () => {
          results.push({
            label,
            route,
            transferEncoding: 'chunked',
            bodyBytes: body.length,
            status: response.statusCode,
            response: Buffer.concat(chunks).toString('utf8').slice(0, 500),
          })
          resolve()
        })
      },
    )
    request.setTimeout(30000, () =>
      request.destroy(new Error(`${label}: timed out waiting for chunked response`)),
    )
    request.on('error', (error) => {
      if (!responseSeen) reject(error)
    })
    request.end(body)
  })
}

async function oversizedForm(fieldName, fieldValue) {
  const form = new FormData()
  form.set(fieldName, fieldValue)
  const encoded = new Request('http://app/', { method: 'POST', body: form })
  return {
    body: Buffer.from(await encoded.arrayBuffer()),
    contentType: encoded.headers.get('content-type'),
  }
}

try {
  await login()
  // The JSON remains syntactically valid (`{}` followed by whitespace), but its UTF-8 field size is
  // 4,000,003 bytes, just over MAX_PREVIEW_JSON_BYTES. With no Content-Length, the post-parse field
  // check must still return 413 after the multipart stream has been read.
  const oversizedData = await oversizedForm('data', '{}'.padEnd(4_000_003, ' '))
  assert(oversizedData.contentType)
  await postChunked(
    `/api/lesson-bundle-versions/${fixture.plans.A.version}/preview`,
    'preview-chunked-field-cap',
    oversizedData.body,
    oversizedData.contentType,
  )
  await postChunked(
    `/api/lesson-bundle-versions/${fixture.plans.A.version}/save-as-new`,
    'save-chunked-field-cap',
    oversizedData.body,
    oversizedData.contentType,
  )
  for (const result of results) assert.equal(result.status, 413, result.label)
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
}
await writeFile(output, JSON.stringify({ results, failure }, null, 2), { mode: 0o600 })
console.log(
  JSON.stringify({
    results: results.map(({ label, status, bodyBytes }) => ({ label, status, bodyBytes })),
    passed: !failure,
  }),
)
if (failure) {
  console.error(failure)
  process.exitCode = 1
}
