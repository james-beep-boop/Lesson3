// computed styles of every element inside open dialogs, both surfaces.
import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { openEditor, expandLessons } from '../helpers/editRecoveryUi'

let fx: RoleFixture
test.beforeAll(async () => {
  fx = await setupRoleFixture()
})
test.afterAll(async () => {
  await fx?.teardown()
})

const PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-top-width',
  'border-bottom-color',
  'border-bottom-width',
  'box-shadow',
  'border-top-left-radius',
  'font-size',
  'font-weight',
  'line-height',
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'gap',
  'display',
  'min-height',
  'outline-style',
  'outline-color',
  'outline-width',
  'outline-offset',
  'overflow-y',
  'max-height',
]
const dump = (page: Page) =>
  page.evaluate((props) => {
    const rows: string[] = []
    document.querySelectorAll('.modal-backdrop, .modal-backdrop *').forEach((el) => {
      const parts: string[] = []
      for (
        let e: Element | null = el;
        e && !e.classList.contains('modal-backdrop');
        e = e.parentElement
      )
        parts.unshift(
          e.tagName.toLowerCase() +
            (e.classList.length ? '.' + [...e.classList].sort().join('.') : ''),
        )
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      rows.push(
        (parts.join('>') || 'BACKDROP') +
          ' | ' +
          props.map((p) => cs.getPropertyValue(p)).join(' ; ') +
          ` ; box ${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
      )
    })
    return rows.sort()
  }, PROPS)

const SYNTH = (tall: boolean, plain: boolean) => `
<div class="modal-backdrop"><div class="modal lp-modal${plain ? ' modal--plain' : ''}" role="dialog" tabindex="-1">
<h2 class="modal__title">A dialog title</h2><div class="modal__content">
<p class="modal__body">One short paragraph of explanation.</p>
<label class="modal__field">Outside a form<input value="text"></label>
<form class="modal__form"><label class="modal__field">Inside a form<input id="synth-in" value="x"></label><label class="modal__field">Second<input></label></form>
${tall ? '<p class="modal__body">' + 'Long text. '.repeat(400) + '</p>' : ''}
<div class="modal__actions modal__actions--pair"><button class="btn" type="button">Cancel</button><button class="btn" type="button">OK</button></div>
<div class="modal__actions"><button class="btn" type="button">Close</button></div>
</div></div></div>`

async function synth(page: Page, out: Record<string, string[]>, key: string) {
  for (const [name, tall, plain] of [
    ['bar', false, false],
    ['plain', false, true],
    ['tall', true, false],
  ] as const) {
    await page.evaluate(
      (html) => {
        const d = document.createElement('div')
        d.id = 'synth'
        d.innerHTML = html
        document.body.appendChild(d)
      },
      SYNTH(tall, plain),
    )
    if (name === 'bar') {
      await page.locator('#synth-in').focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
    }
    out[`${key}/synth-${name}`] = await dump(page)
    if (name === 'tall') {
      out[`${key}/synth-tall-scroll`] = [
        await page.evaluate(() => {
          const m = document.querySelector('#synth .modal')!.getBoundingClientRect()
          window.scrollTo(0, 99999)
          return `panel top ${m.top.toFixed(0)} bottom ${m.bottom.toFixed(0)} vh ${innerHeight} docScroll ${document.scrollingElement!.scrollHeight}`
        }),
      ]
    }
    await page.evaluate(() => document.getElementById('synth')?.remove())
  }
}

test('dialogs', async ({ browser }) => {
  test.setTimeout(400_000)
  const out: Record<string, string[]> = {}
  for (const [vp, size] of [
    ['desktop', { width: 1280, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ] as const) {
    const page = await browser.newPage({ viewport: size })
    await loginAs(page, fx, 'siteAdmin')
    // App pages
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await synth(page, out, `${vp}/app`)
    const chip = page.getByRole('button', { name: /versions ▾/ }).first()
    if (await chip.count()) {
      await chip.click()
      await page.waitForTimeout(800)
      out[`${vp}/app/versions`] = await dump(page)
      await page.keyboard.press('Escape')
    }
    if (vp === 'phone') {
      await page.goto(`${BASE}/lessons/${fx.plan.id}`)
      await page.waitForLoadState('networkidle')
      const edit = page.getByRole('button', { name: /^(Edit|Continue editing)$/ })
      if (await edit.count()) {
        await edit.click()
        await page.waitForTimeout(500)
        out[`${vp}/app/too-narrow`] = await dump(page)
        await page.keyboard.press('Escape')
      }
    }
    // Manage / editor
    await page.goto(`${BASE}/admin`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await synth(page, out, `${vp}/admin`)
    if (vp === 'desktop') {
      await openEditor(page, fx.version.id)
      const help = page.getByRole('button', { name: 'Help', exact: true })
      if (await help.count()) {
        await help.click()
        await page.waitForTimeout(500)
        out[`${vp}/admin/help`] = await dump(page)
        await page.keyboard.press('Escape')
      }
      await expandLessons(page)
      for (const b of await page.getByRole('button', { name: 'Show All', exact: true }).all())
        if (await b.isVisible()) await b.click()
      const col = page.locator('#field-lessons__0__framework__0__learnerExperience')
      if (await col.count()) {
        await col.click()
        await page.getByRole('button', { name: 'Insert link', exact: true }).click()
        await page.waitForTimeout(500)
        out[`${vp}/admin/insert-link`] = await dump(page)
        const addr = page.getByRole('button', { name: 'Insert address', exact: true })
        if (await addr.count()) {
          await addr.click()
          await page.waitForTimeout(300)
          out[`${vp}/admin/insert-link-error`] = await dump(page)
        }
        await page.keyboard.press('Escape')
      }
    }
    await page.close()
  }
  fs.writeFileSync(process.env.STYLE_OUT!, JSON.stringify({ __props: PROPS, ...out }, null, 1))
})
