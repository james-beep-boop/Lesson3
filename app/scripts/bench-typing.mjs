/**
 * Typing benchmark for the version edit page: headless Chromium, real key events.
 * (docs/PLAN-editing-typing-speed-2026-10-23.md §3.2, §3.4 and §6.)
 *
 * Measures what a person feels while typing into a prose field: per-keystroke latency from the Event
 * Timing API (`keydown` duration, which runs until the next paint), total long-task time, and
 * optionally a CPU profile. Run it against a PRODUCTION build; dev mode is several times slower and
 * says nothing about the deployed app.
 *
 * ⚑ THROWAWAY STACKS ONLY. It signs in with the local seed Site Administrator and types into a real
 * version. Nothing is saved as a version, but edit recovery keeps a private draft for that account,
 * and the next run then opens on the restore prompt and stops ("restore prompt is open"). Clear
 * drafts between runs (`DELETE FROM edit_recovery` on the throwaway database). It refuses any host
 * but localhost unless BENCH_ALLOW_HOST names it.
 *
 * Run it from the `lesson3-e2e` image (Playwright + Chromium), sharing the app container's network so
 * that `localhost:3000` is the app, from the repo root:
 *
 *   docker run --rm --network container:<app-container> \
 *     -v "$PWD/app/scripts:/app/scripts:ro" -w /app lesson3-e2e node scripts/bench-typing.mjs
 *
 * Environment (all optional):
 *   BENCH_URL       app origin                                   default http://localhost:3000
 *   BENCH_VERSION   lesson-bundle-versions id to open            default 2
 *   BENCH_LESSON    0-based lesson row to type into              default 5
 *   BENCH_EMAIL / BENCH_PASSWORD                                 default the local seed Site Administrator
 *   BENCH_RATES     CPU throttle rates, comma-separated          default 1,4
 *   BENCH_PROFILE   directory for <label>.cpuprofile (1× pass)   default none
 *   BENCH_LABEL     name printed with the result                 default "bench"
 *
 * Prints one JSON line. Latencies are in ms. Event Timing only reports events of 16 ms or more, so a
 * key with no timing entry was faster than that, but only if it actually arrived (plan §4.5). Each pass
 * therefore counts the keydowns the textarea received and checks the typed text appears exactly at
 * the caret; if either check fails it prints the pass and exits 1 with no percentiles. Otherwise the
 * median and p90 are over ALL typed keys, with unreported keys counted as below the threshold; a
 * percentile that lands on one prints as "<16", never 0. `maxMs` is null when no key was reported.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BENCH_URL ?? 'http://localhost:3000'
const VERSION = process.env.BENCH_VERSION ?? '2'
const LESSON = Number(process.env.BENCH_LESSON ?? '5')
const EMAIL = process.env.BENCH_EMAIL ?? 'siteadmin@local.test'
const PASSWORD = process.env.BENCH_PASSWORD ?? 'local1234'
const RATES = (process.env.BENCH_RATES ?? '1,4').split(',').map(Number)
const PROFILE_DIR = process.env.BENCH_PROFILE
const LABEL = process.env.BENCH_LABEL ?? 'bench'
const TEXT = 'the heart pumps blood around the body'
const KEY_DELAY_MS = 120

const host = new URL(BASE).hostname
if (!['localhost', '127.0.0.1', process.env.BENCH_ALLOW_HOST].includes(host)) {
  console.error(`bench-typing: refusing to run against ${host}; set BENCH_ALLOW_HOST to allow it.`)
  process.exit(2)
}

// `sorted` holds one entry per typed key; BELOW marks a key with no Event Timing entry.
const BELOW = -1
const quantile = (sorted, p) => {
  const v = sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  return v === BELOW ? '<16' : Math.round(v)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.press('input[type=password]', 'Enter')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })

  await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${VERSION}?edit=1`)
  const fieldId = `#field-lessons__${LESSON}__overview`
  await page.waitForSelector(fieldId, { state: 'attached', timeout: 60_000 })
  // Let lazy field rendering and the first server form-state round-trip settle.
  await page.waitForTimeout(6_000)
  if (await page.$('[role=dialog], dialog')) throw new Error('restore prompt is open; clear drafts')

  // The realistic shape: every lesson collapsed, one open.
  await page.evaluate(() =>
    [...document.querySelectorAll('#field-lessons .array-field__header-action')]
      .find((b) => b.textContent.trim() === 'Collapse All')
      ?.click(),
  )
  await page.waitForTimeout(1_500)
  await page.evaluate(
    (row) => document.querySelector(`#lessons-row-${row} .collapsible__toggle`)?.click(),
    LESSON,
  )
  await page.waitForTimeout(2_000)
  const field = page.locator(fieldId)
  await field.scrollIntoViewIfNeeded()
  await field.click()
  await page.keyboard.press('End')

  const cdp = await page.context().newCDPSession(page)
  const result = { label: LABEL, version: VERSION, lesson: LESSON, keys: TEXT.length }
  for (const rate of RATES) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.waitForTimeout(8_000)
    await page.evaluate((id) => {
      const textarea = document.querySelector(id)
      window.__bench = { keys: [], longTasks: [], observers: [], received: 0 }
      window.__bench.before = textarea.value
      // `End` moves to the end of the caret's LINE in a multi-line textarea, so the keys land at
      // the caret, not necessarily at the end of the text.
      window.__bench.caret = textarea.selectionStart
      window.__bench.onKey = () => window.__bench.received++
      textarea.addEventListener('keydown', window.__bench.onKey)
      const keys = new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (e.name === 'keydown') window.__bench.keys.push(e.duration)
      })
      keys.observe({ type: 'event', durationThreshold: 16 })
      const tasks = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__bench.longTasks.push(e.duration)
      })
      tasks.observe({ type: 'longtask' })
      window.__bench.observers.push(keys, tasks)
    }, fieldId)
    const profiling = PROFILE_DIR && rate === 1
    if (profiling) {
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
      await cdp.send('Profiler.start')
    }
    const started = Date.now()
    await page.keyboard.type(TEXT, { delay: KEY_DELAY_MS })
    const typingWallMs = Date.now() - started
    await page.waitForTimeout(4_000)
    if (profiling) {
      const { profile } = await cdp.send('Profiler.stop')
      fs.mkdirSync(PROFILE_DIR, { recursive: true })
      fs.writeFileSync(path.join(PROFILE_DIR, `${LABEL}.cpuprofile`), JSON.stringify(profile))
    }
    const { keys, longTasks, received, before, caret, after } = await page.evaluate((id) => {
      const textarea = document.querySelector(id)
      textarea.removeEventListener('keydown', window.__bench.onKey)
      window.__bench.observers.forEach((o) => o.disconnect())
      const { keys, longTasks, received, before, caret } = window.__bench
      return { keys, longTasks, received, before, caret, after: textarea.value }
    }, fieldId)
    const pass = {
      keysTyped: TEXT.length,
      keysReceived: received,
      keysReported: keys.length,
      keysBelowThreshold: TEXT.length - keys.length,
    }
    const delivered =
      received === TEXT.length &&
      after === before.slice(0, caret) + TEXT + before.slice(caret) &&
      keys.length <= TEXT.length
    if (!delivered) {
      result[`cpu${rate}x`] = {
        ...pass,
        error: 'input not delivered as typed',
        // What arrived at the caret, against what was typed there.
        atCaret: after.slice(Math.max(0, caret - 20), caret + TEXT.length + 20),
        expected:
          before.slice(Math.max(0, caret - 20), caret) + TEXT + before.slice(caret, caret + 20),
        lengthDelta: after.length - before.length,
      }
      console.log(JSON.stringify(result))
      process.exitCode = 1
      break
    }
    const sorted = [...keys, ...Array(TEXT.length - keys.length).fill(BELOW)].sort((a, b) => a - b)
    result[`cpu${rate}x`] = {
      ...pass,
      medianMs: quantile(sorted, 0.5),
      p90Ms: quantile(sorted, 0.9),
      maxMs: keys.length ? Math.round(Math.max(...keys)) : null,
      longTaskTotalMs: Math.round(longTasks.reduce((a, b) => a + b, 0)),
      typingWallMs,
    }
  }
  if (!process.exitCode) console.log(JSON.stringify(result))
} finally {
  await browser.close()
}
