// Stream one just-over-limit upload with HTTP/1.1 chunked framing. The public reverse proxy must
// reject this before the application; the direct app target demonstrates the defense-in-depth
// post-parse file/request cap and records whether any lesson-plan rows changed.
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'

const fixturePath = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(process.env.E2E_BASE_URL, 'http://app:3000')
assert(fixturePath && output)
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const limit = 200 * 1024 * 1024 + 256 * 1024
const boundary = 'audit-chunked-upload'
const prefix = Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="oversized.json"\r\nContent-Type: application/json\r\n\r\n`,
)
const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
const totalBody = limit + prefix.length + suffix.length + 1
const fileBytes = totalBody - prefix.length - suffix.length
assert(fileBytes > limit)
let token
let failure
let result

async function api(path) {
  const response = await fetch(`http://app:3000${path}`, {
    headers: { Authorization: `JWT ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

async function login() {
  const response = await fetch('http://app:3000/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.accounts.siteAdmin.email, password: fixture.password }),
  })
  assert.equal(response.status, 200)
  token = (await response.json()).token
}

async function streamUpload() {
  return new Promise((resolve, reject) => {
    let responseSeen = false
    const request = http.request(
      {
        hostname: 'app',
        port: 3000,
        path: '/api/lesson-plans/upload',
        method: 'POST',
        agent: false,
        headers: {
          Authorization: `JWT ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Transfer-Encoding': 'chunked',
        },
      },
      (response) => {
        responseSeen = true
        const chunks = []
        response.on('data', (chunk) => {
          if (Buffer.byteLength(Buffer.concat(chunks)) < 4096) chunks.push(chunk)
        })
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            response: Buffer.concat(chunks).toString('utf8').slice(0, 500),
            transferEncoding: 'chunked',
            bodyBytes: totalBody,
          }),
        )
      },
    )
    request.setTimeout(120000, () =>
      request.destroy(new Error('chunked upload timed out waiting for response')),
    )
    request.on('error', (error) => {
      if (!responseSeen) reject(error)
    })
    ;(async () => {
      try {
        request.write(prefix)
        let remaining = fileBytes
        const first = Buffer.from('{}')
        request.write(first)
        remaining -= first.length
        const chunk = Buffer.alloc(1024 * 1024, 0x20)
        while (remaining > 0) {
          const part = remaining >= chunk.length ? chunk : chunk.subarray(0, remaining)
          if (!request.write(part)) await once(request, 'drain')
          remaining -= part.length
        }
        request.end(suffix)
      } catch (error) {
        request.destroy(error)
      }
    })()
  })
}

try {
  await login()
  const before = await api('/api/lesson-plans?limit=0&depth=0')
  assert.equal(before.status, 200)
  result = await streamUpload()
  assert([400, 413].includes(result.status), `unexpected upload status ${result.status}`)
  assert.match(result.response, /Upload too large/i)
  const after = await api('/api/lesson-plans?limit=0&depth=0')
  assert.equal(after.status, 200)
  assert.equal(after.body.totalDocs, before.body.totalDocs)
  result.beforeTotalDocs = before.body.totalDocs
  result.afterTotalDocs = after.body.totalDocs
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
}
await writeFile(output, JSON.stringify({ limit, totalBody, result, failure }, null, 2), {
  mode: 0o600,
})
console.log(JSON.stringify({ result, passed: !failure }))
if (failure) {
  console.error(failure)
  process.exitCode = 1
}
