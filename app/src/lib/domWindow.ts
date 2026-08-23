/**
 * THE server-side DOM. One jsdom window for the process, shared by every module that needs to parse
 * or serialize HTML off-request:
 *   - `sanitizeHtml.ts` — DOMPurify needs a DOM to parse into
 *   - `compareGroups.ts` — splits a rendered document into logical areas
 *
 * ⚑ ONE WINDOW, NOT ONE PER MODULE. Each `new JSDOM('')` carries a full DOM implementation, and this
 * app runs on a 2-CPU box whose whole caching layer exists to keep memory and CPU bursts down; two
 * resident windows for the same job is exactly the kind of duplication that layer is protecting
 * against. Sharing it is safe because both consumers only parse and serialize — no scripts, no
 * layout, no global mutation. A consumer that needs an isolated document must take one explicitly,
 * with `window.document.implementation.createHTMLDocument('')`, rather than reusing
 * `window.document`.
 */
import { JSDOM } from 'jsdom'

export const { window } = new JSDOM('')
