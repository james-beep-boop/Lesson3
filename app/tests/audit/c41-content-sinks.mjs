// End-to-end prose sink probe. Synthetic content/recipient only; deletes its owned plan in finally.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL
const fixturePath = process.env.LESSON3_AUDIT_FIXTURE_FILE
const sourcePath = process.env.LESSON3_AUDIT_SOURCE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert.equal(base, 'http://app:3000')
const browserBase = process.env.BROWSER_BASE_URL || base
assert(fixturePath && sourcePath && output)
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
assert(fixture.run.startsWith('l3audit-'))
const source = JSON.parse(await readFile(sourcePath, 'utf8'))
const marker =
  'ZZ_AUDIT_C41_TEXT_<script>alert("x")</script><img src=x onerror=alert(1)><svg><a href="javascript:alert(2)">link</a></svg>'
const planIds = new Set()
const results = []
let token
let failure

async function api(method, route, data) {
  const form = data instanceof FormData
  const response = await fetch(new URL(route, base), {
    method,
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(data !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(90000),
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('text/html')
    ? await response.text()
    : contentType.includes('application/zip') ||
        contentType.includes('application/pdf') ||
        contentType.includes('application/vnd.openxmlformats')
      ? new Uint8Array(await response.arrayBuffer())
      : await response.json()
  return { status: response.status, headers: Object.fromEntries(response.headers), body }
}

function setRichText(bundle) {
  const text = (value) => `${String(value ?? '')} ${marker}`
  bundle.META.titleDoc = text(bundle.META.titleDoc)
  bundle.META.substrand_name = text(bundle.META.substrand_name)
  bundle.UNIT = {
    gradeLevel: text('Grade 10'),
    subject: text('Science'),
    strand: text('Strand'),
    substrand: text('Substrand'),
    totalDuration: text('40 minutes'),
    content: text('content'),
    learningOutcomes: text('outcomes'),
    coreCompetencies: text('competencies'),
  }
  const lesson = bundle.LESSONS[0]
  lesson.title = text(lesson.title)
  lesson.duration = text(lesson.duration)
  lesson.overview = text('overview')
  for (const key of ['purpose', 'knowledge', 'skills', 'attitudes', 'keyInquiry'])
    lesson.slo[key] = text(lesson.slo[key])
  for (const key of [
    'learnerExperience',
    'teacherMoves',
    'sensemakingStrategy',
    'formativeAssessment',
  ])
    lesson.framework[0][key] = text(lesson.framework[0][key])
  for (const key of ['observed', 'learned', 'explained'])
    lesson.summaryTablePrompt[key] = text(lesson.summaryTablePrompt[key])
  bundle.FINAL_EXPLANATION = {
    subjectLabel: text('Science'),
    instructions: text('instructions'),
    sections: [{ title: text('section'), prompt: text('prompt'), exemplar: text('answer') }],
  }
  bundle.SUMMARY_TABLE = {
    subStrand: text('Substrand'),
    drivingQuestion: text('why?'),
    lessons: [
      {
        number: 1,
        title: text('lesson'),
        observed: text('o'),
        learned: text('l'),
        explained: text('e'),
      },
    ],
  }
  return bundle
}

async function pollMail(recipient, deadline = Date.now() + 90000) {
  while (Date.now() < deadline) {
    const listing = await (await fetch('http://mail:8025/api/v1/messages')).json()
    const found = listing.messages?.find(
      (message) =>
        message.To?.some((to) => to.Address === recipient) &&
        /^Lesson plan:/i.test(message.Subject || ''),
    )
    if (found) return await (await fetch(`http://mail:8025/api/v1/message/${found.ID}`)).json()
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Mailpit message for ${recipient} did not arrive`)
}

async function cleanup() {
  for (const id of planIds) {
    const response = await api('DELETE', `/api/lesson-plans/${id}`)
    assert.equal(response.status, 200, `cleanup plan ${id}`)
    planIds.delete(id)
  }
}

try {
  const account = fixture.accounts.siteAdmin
  const login = await api('POST', '/api/users/login', {
    email: account.email,
    password: fixture.password,
  })
  assert.equal(login.status, 200)
  token = login.body.token

  const bundle = setRichText(structuredClone(source))
  bundle.META.substrand_id = '991.c41.sinks'
  const upload = new FormData()
  upload.append('files', new File([JSON.stringify(bundle)], 'sinks.json'))
  const imported = await api('POST', '/api/lesson-plans/upload', upload)
  assert.equal(imported.status, 200)
  assert.equal(imported.body.count, 1)
  const planId = imported.body.bundles[0].id
  planIds.add(planId)
  const plan = await api('GET', `/api/lesson-plans/${planId}?depth=0`)
  assert.equal(plan.status, 200)
  const versionId = plan.body.officialVersion
  const version = await api('GET', `/api/lesson-bundle-versions/${versionId}?depth=0`)
  assert.equal(version.status, 200)
  const versionData = version.body

  const stored = await api('GET', `/api/lesson-bundle-versions/${versionId}/preview`)
  assert.equal(stored.status, 200)
  assert.equal(
    stored.headers['content-security-policy'],
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  )
  assert.equal(stored.headers['x-content-type-options'], 'nosniff')
  const suspiciousText = [
    ...stored.body.matchAll(/.{0,120}(?:<script\b|<img\b|<svg\b|<iframe\b|\son\w+=).{0,180}/gis),
  ].map((match) => match[0])
  const suspicious = [...stored.body.matchAll(/<(?:script|img|svg|iframe)\b/gi)].map(
    (match) => match[0],
  )
  results.push({ sink: 'stored-preview-inspection', suspicious, suspiciousText })
  assert.equal(
    suspicious.length,
    0,
    `stored preview contains executable-looking markup: ${JSON.stringify(suspicious)}`,
  )
  assert(stored.body.includes('&lt;script&gt;') || stored.body.includes('script'))
  assert(stored.body.includes('ZZ_AUDIT_C41_TEXT_'))
  results.push({
    sink: 'stored-preview',
    status: stored.status,
    csp: stored.headers['content-security-policy'],
    htmlBytes: stored.body.length,
  })

  const unsaved = structuredClone(versionData)
  unsaved.lessons[0].overview = marker
  const form = new FormData()
  form.set('data', JSON.stringify(unsaved))
  const draft = await api('POST', `/api/lesson-bundle-versions/${versionId}/preview`, form)
  assert.equal(draft.status, 200)
  assert(!/<(?:script|img|svg|iframe)\b/i.test(draft.body))
  assert(draft.body.includes('ZZ_AUDIT_C41_TEXT_'))
  results.push({ sink: 'unsaved-preview', status: draft.status, htmlBytes: draft.body.length })

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ extraHTTPHeaders: { Authorization: `JWT ${token}` } })
    const consoleErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    const response = await page.goto(
      new URL(`/api/lesson-bundle-versions/${versionId}/preview`, browserBase).toString(),
      { waitUntil: 'networkidle' },
    )
    assert.equal(response.status(), 200)
    const dom = await page.evaluate(() => ({
      scripts: document.querySelectorAll('script').length,
      images: document.querySelectorAll('img').length,
      svg: document.querySelectorAll('svg').length,
      iframes: document.querySelectorAll('iframe').length,
      handlers: document.querySelectorAll('[onerror],[onclick],[onload]').length,
      text: document.body.innerText,
      title: document.title,
    }))
    assert.equal(dom.scripts, 0)
    assert.equal(dom.images, 0)
    assert.equal(dom.svg, 0)
    assert.equal(dom.iframes, 0)
    assert.equal(dom.handlers, 0)
    assert(dom.text.includes('ZZ_AUDIT_C41_TEXT_'))
    assert.equal(consoleErrors.length, 0)
    results.push({ sink: 'chromium-preview', status: response.status(), dom, consoleErrors })
    await page.close()
  } finally {
    await browser.close()
  }

  const prepare = await api('POST', `/api/lesson-bundle-versions/${versionId}/export?as=docx`)
  assert([200, 202].includes(prepare.status))
  results.push({ sink: 'export-prepare', status: prepare.status, body: prepare.body })
  const statusUrl = prepare.body.statusUrl
  if (statusUrl) {
    let state = 'preparing'
    for (let i = 0; i < 90 && state === 'preparing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const status = await api('GET', statusUrl)
      assert.equal(status.status, 200)
      state = status.body.state
      if (state === 'error') throw new Error(`export job failed: ${JSON.stringify(status.body)}`)
    }
    assert.equal(state, 'ready')
  }
  const download = await api('GET', `/api/lesson-bundle-versions/${versionId}/export?as=docx`)
  assert.equal(download.status, 200)
  assert.equal(download.headers['content-type'], 'application/zip')
  results.push({
    sink: 'export-download',
    status: download.status,
    bytes: download.body.byteLength,
  })

  const recipient = fixture.accounts.teacher.email
  const email = await api('POST', `/api/lesson-bundle-versions/${versionId}/email?as=docx`, {
    to: recipient,
  })
  assert.equal(email.status, 202)
  const message = await pollMail(recipient)
  assert(message.Subject && !/[\r\n]/.test(message.Subject))
  assert((message.Text || message.HTML || '').includes('sent you a lesson plan'))
  assert((message.Text || message.HTML || '').includes('ZZ_AUDIT_C41_TEXT_'))
  assert(message.Attachments?.length >= 1)
  results.push({
    sink: 'mailpit',
    status: email.status,
    subject: message.Subject,
    attachments: message.Attachments?.map((item) => item.FileName),
  })
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
} finally {
  try {
    await cleanup()
  } catch (error) {
    failure = `${failure || ''}\nCleanup: ${error}`
  }
  await writeFile(
    output,
    JSON.stringify({ results, failure, remainingOwned: [...planIds] }, null, 2),
    { mode: 0o600 },
  )
  console.log(JSON.stringify({ sinks: results.map((result) => result.sink), passed: !failure }))
  if (failure) {
    console.error(failure)
    process.exitCode = 1
  }
}
