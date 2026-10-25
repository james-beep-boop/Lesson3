// Shared by the three style-snapshot specs. See README.md in this directory.
import type { Page } from '@playwright/test'

export const VIEWPORTS = [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const

/**
 * One row per element: its class path, then each of `props` computed. Rows are sorted so two runs line
 * up by path. With `root`, only that element and its descendants are dumped, paths start below it, and
 * the root's own row is `ROOT`.
 */
export const dump = (page: Page, props: string[], root?: string) =>
  page.evaluate(
    ([props, root]) => {
      const stop = root ? document.querySelector(root) : document.documentElement
      const rows: string[] = []
      const els = root
        ? document.querySelectorAll(`${root}, ${root} *`)
        : document.querySelectorAll('*')
      els.forEach((el) => {
        const parts: string[] = []
        for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
          parts.unshift(
            e.tagName.toLowerCase() +
              (e.classList.length ? '.' + [...e.classList].sort().join('.') : ''),
          )
        }
        const cs = getComputedStyle(el)
        rows.push(
          (parts.join('>') || 'ROOT') +
            ' | ' +
            props.map((p) => cs.getPropertyValue(p)).join(' ; '),
        )
      })
      return rows.sort()
    },
    [props, root] as const,
  )
