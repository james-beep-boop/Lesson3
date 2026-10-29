/**
 * Patch Payload's pre-built admin client bundle for typing speed on the version edit page.
 * (docs/PLAN-editing-typing-speed-2026-10-23.md §4; approved by Codex at 3f25375.)
 *
 * Two exact replacements in `@payloadcms/ui/dist/exports/client/index.js`:
 *
 *   ucs       — the bundle's inlined `use-context-selector@2.0.0`. A subscriber's listener now compares
 *               its selection before scheduling a render, instead of dispatching unconditionally, and a
 *               commit-time catch-up check covers notifications that arrive between render and commit
 *               (plan §4.1).
 *   rowlabel  — `RowLabelProvider` reads the form getters from `useForm()` (stable) instead of
 *               `useWatchForm()` (changes on every keystroke) (plan §4.2).
 *
 * Runs from `postinstall`, so every `npm ci` applies it (Dockerfile `deps` and `e2e` stages, the
 * `lesson3-deps` image, CI). Fails the install loudly rather than ship unpatched:
 *
 *   - each NAME_CHECK must occur exactly once, so the minified names in the replacements mean what
 *     they are assumed to mean;
 *   - for each patch, `from` once and `to` absent → apply; `to` once and `from` absent → already
 *     applied; anything else (including a marker without the exact `to`, i.e. an older or damaged
 *     revision of this patch) → exit non-zero;
 *   - both patches must end up applied; one applied and one not is an error.
 *
 * ⚑ The strings are tied to the pinned `@payloadcms/ui` (3.92.1; unchanged from 3.91.0). On every
 * deliberate Payload upgrade, re-derive them from the new bundle. If Payload fixes either problem
 * upstream, delete the patch on that upgrade. Rollback: remove the `postinstall` line and rebuild.
 *
 * Usage: node scripts/patch-payload-ui.mjs [path/to/index.js]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// The file the app actually imports (`@payloadcms/ui`'s `.` export), resolved rather than assumed,
// so a changed exports map or install layout cannot leave the patch on a file nothing loads.
export const DEFAULT_TARGET = createRequire(import.meta.url).resolve('@payloadcms/ui')

/** Strings that must each occur exactly once before anything is written. */
export const NAME_CHECKS = [
  // The inlined library's React imports: `Ub` is useRef, `wL` useLayoutEffect, `CL` useContext.
  'import{createElement as vL,createContext as yL,useContext as CL,useEffect as xL,useLayoutEffect as wL,useReducer as SL,useRef as Ub,useState as IL}from"react";',
  // `e2` is the isomorphic layout effect.
  'e2=RL?xL:wL',
  // useContextSelector's head: `o` is the provider handle, `r` the value this render read, `l`/`a`
  // the reducer state and dispatch, `s` the listener set — every name the ucs replacement uses.
  'function Xb(t,e){let o=CL(t)[uf],{v:{current:r},n:{current:n},l:s}=o,i=e(r),[l,a]=SL(',
  // Ge and bf, as used by the rowlabel replacement.
  'Ge as useForm',
  'bf as useWatchForm',
]

export const PATCHES = [
  {
    name: 'ucs',
    marker: '/*lesson3-patch:ucs*/',
    from: 'return Object.is(l[1],i)||a(),e2(()=>(s.add(a),()=>{s.delete(a)}),[s]),l[1]}',
    to: '/*lesson3-patch:ucs*/let R=Ub(null);e2(()=>{R.current={e,s:l[1]};let v=o.v.current;if(!Object.is(v,r))try{Object.is(l[1],e(v))||a()}catch{a()}});return Object.is(l[1],i)||a(),e2(()=>{let L=u=>{if(u&&"v"in u&&!("p"in u)&&R.current)try{if(Object.is(R.current.s,R.current.e(u.v)))return}catch{}a(u)};return s.add(L),()=>{s.delete(L)}},[s]),l[1]}',
  },
  {
    name: 'rowlabel',
    marker: '/*lesson3-patch:rowlabel*/',
    from: 'Qb=({children:t,path:e,rowNumber:o})=>{let{getDataByPath:r,getSiblingData:n}=bf(),',
    to: 'Qb=({children:t,path:e,rowNumber:o})=>{/*lesson3-patch:rowlabel*/let{getDataByPath:r,getSiblingData:n}=Ge(),',
  },
]

const count = (haystack, needle) => haystack.split(needle).length - 1

/**
 * Pure core: returns `{ source, applied }` where `applied` lists the patches written this call (empty
 * when the bundle was already fully patched). Throws with a reason on any unexpected shape.
 */
export function patchSource(source) {
  for (const check of NAME_CHECKS) {
    const n = count(source, check)
    if (n !== 1) throw new Error(`name check expected once, found ${n}: ${check.slice(0, 80)}`)
  }
  const states = PATCHES.map((p) => {
    const from = count(source, p.from)
    const to = count(source, p.to)
    if (from === 1 && to === 0) {
      if (source.includes(p.marker)) {
        throw new Error(`${p.name}: marker present but patch not applied — damaged bundle`)
      }
      return 'pending'
    }
    if (from === 0 && to === 1) return 'applied'
    if (from === 0 && to === 0 && source.includes(p.marker)) {
      throw new Error(
        `${p.name}: marker present without the exact patched text — an older or damaged revision`,
      )
    }
    throw new Error(`${p.name}: expected the original once or the patch once; found ${from}/${to}`)
  })
  if (states.includes('applied') && states.includes('pending')) {
    throw new Error(`partially patched (${PATCHES.map((p, i) => `${p.name}=${states[i]}`)})`)
  }
  let out = source
  const applied = []
  PATCHES.forEach((p, i) => {
    if (states[i] === 'pending') {
      out = out.replace(p.from, () => p.to)
      applied.push(p.name)
    }
  })
  return { source: out, applied }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] ?? DEFAULT_TARGET
  try {
    const { source, applied } = patchSource(readFileSync(target, 'utf8'))
    if (applied.length) {
      writeFileSync(target, source)
      console.log(`patch-payload-ui: applied ${applied.join(', ')}`)
    } else {
      console.log('patch-payload-ui: already applied')
    }
  } catch (err) {
    console.error(`patch-payload-ui: ${err.message}\n  target: ${target}`)
    console.error('  See docs/PLAN-editing-typing-speed-2026-10-23.md §4.4 (re-derive on upgrade).')
    process.exit(1)
  }
}
