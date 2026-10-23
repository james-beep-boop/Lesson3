// @vitest-environment jsdom
/**
 * Behaviour of the patched `use-context-selector` inside Payload's admin bundle
 * (scripts/patch-payload-ui.mjs; docs/PLAN-editing-typing-speed-2026-10-23.md §4.1 and §5 part 2).
 *
 * The code under test is lifted from the INSTALLED, patched bundle, between the anchors the patch
 * script itself checks, and evaluated with this repo's React. Each case runs against that patched code
 * and against the original (rebuilt by reversing the replacement). Every case asserts the settled
 * visible value is the selector applied to the provider's live value; only render counts may differ.
 *
 * The render-to-commit window (Codex P1) is opened deliberately rather than hoped for. A `Notifier`
 * placed as an EARLIER sibling of the subscriber runs its layout effect after the subscriber has
 * rendered but before the subscriber's own layout effects. It simulates a provider commit: it sets the
 * provider's value ref and calls every listener with `{ n, v }`, as the provider does. The §3.2
 * prototype (no commit-time catch-up check) is kept here as a third implementation, to show that the
 * P1 test fails without the fix.
 */
/* eslint-disable react-hooks/immutability -- a test harness: components deliberately hand their
   setters, provider handles and render counts to the test by writing to outside objects. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TARGET, NAME_CHECKS, PATCHES } from '../../scripts/patch-payload-ui.mjs'

type Action = { n: number; v?: unknown; p?: Promise<unknown> }
type Handle = {
  v: { current: unknown }
  n: { current: number }
  l: Set<(action: Action) => void>
  u: (thunk: () => void, options?: { suspense?: boolean }) => void
}
type Impl = {
  createContext: <T>(value: T) => React.Context<T>
  useContextSelector: <T, S>(context: React.Context<T>, selector: (value: T) => S) => S
  uf: symbol
}

// --- Lift the inlined library out of the installed bundle --------------------------------------

const ucs = PATCHES[0]!
const IMPORT_LINE = NAME_CHECKS[0]!
const bundle = readFileSync(DEFAULT_TARGET, 'utf8')
const spanStart = bundle.indexOf(IMPORT_LINE) + IMPORT_LINE.length
const spanEnd = bundle.indexOf(ucs.to) + ucs.to.length
const patchedSpan = bundle.slice(spanStart, spanEnd)

/** The prototype measured in §3.2: the listener filter without the commit-time catch-up check. */
const PROTOTYPE_TO =
  'let R=Ub(null);e2(()=>{R.current={e,s:l[1]}});return Object.is(l[1],i)||a(),e2(()=>{let L=u=>{if(u&&"v"in u&&!("p"in u)&&R.current)try{if(Object.is(R.current.s,R.current.e(u.v)))return}catch{}a(u)};return s.add(L),()=>{s.delete(L)}},[s]),l[1]}'

const scheduler = createRequire(import.meta.url)('scheduler')

// `import{createElement as vL,…}from"react";` → `createElement:vL,…`, destructured from React below.
const REACT_BINDINGS = IMPORT_LINE.slice('import{'.length, IMPORT_LINE.indexOf('}from'))
  .split(',')
  .map((pair) => pair.split(' as ').join(':'))
  .join(',')

function load(span: string): Impl {
  const name = (re: RegExp) => {
    const m = re.exec(span)
    if (!m) throw new Error(`anchor ${re} not found in the lifted span`)
    return m[1]!
  }
  const schedulerName = name(/([\w$]+)\.unstable_runWithPriority\?/)
  const createContext = name(/function ([\w$]+)\(t\)\{let e=yL\(/)
  const useContextSelector = name(/function ([\w$]+)\(t,e\)\{let o=CL\(t\)\[/)
  const uf = name(/^var ([\w$]+)=Symbol\(\)/)
  const body = `const{${REACT_BINDINGS}}=React;${span};return{createContext:${createContext},useContextSelector:${useContextSelector},uf:${uf}}`
  return new Function('React', schedulerName, body)(React, scheduler) as Impl
}

const patched = load(patchedSpan)
const original = load(patchedSpan.replace(ucs.to, () => ucs.from))
const prototype = load(patchedSpan.replace(ucs.to, () => PROTOTYPE_TO))
const IMPLS: [string, Impl][] = [
  ['patched', patched],
  ['original', original],
]

/** The provider's internals, which the library keeps under its private symbol on the context value. */
const handleOf = (impl: Impl, holder: unknown) => (holder as Record<symbol, Handle>)[impl.uf]!

// --- Harness -----------------------------------------------------------------------------------

type Val = { a: number; b: number }
type Sel = (v: Val) => unknown
const selA: Sel = (v) => v.a
const selB: Sel = (v) => v.b
const V = (a: number, b: number): Val => ({ a, b })

function harness(impl: Impl, initial: Val = V(0, 0)) {
  const Ctx = impl.createContext<Val>(initial)
  const renders = { count: 0 }
  const armed: { value?: Val } = {}
  const ctl: {
    setValue?: React.Dispatch<React.SetStateAction<Val>>
    setSel?: (s: Sel) => void
    setShow?: (s: boolean) => void
    handle?: Handle
  } = {}

  function Sub({ sel, id = 'sub' }: { sel: Sel; id?: string }) {
    const x = impl.useContextSelector(Ctx, sel)
    renders.count++
    return <span data-testid={id}>{JSON.stringify(x)}</span>
  }
  // Memoised, as Payload's fields effectively are, so a parent render does not mask what the context
  // subscription itself schedules.
  const MemoSub = React.memo(Sub)

  /** Simulates a provider commit between the subscriber's render and its layout effects. */
  function Notifier() {
    const handle = handleOf(impl, React.useContext(Ctx))
    ctl.handle = handle
    React.useLayoutEffect(() => {
      if (!('value' in armed)) return
      const v = armed.value
      delete armed.value
      handle.v.current = v
      handle.n.current += 1
      const n = handle.n.current
      handle.l.forEach((listener) => listener({ n, v }))
    })
    return null
  }

  function App({ sel: initialSel, children }: { sel: Sel; children?: React.ReactNode }) {
    const [value, setValue] = React.useState(initial)
    const [sel, setSel] = React.useState<{ s: Sel }>({ s: initialSel })
    const [show, setShow] = React.useState(true)
    ctl.setValue = setValue
    ctl.setSel = (s) => setSel({ s })
    ctl.setShow = setShow
    return (
      <Ctx.Provider value={value}>
        <Notifier />
        {show && <MemoSub sel={sel.s} />}
        {children}
      </Ctx.Provider>
    )
  }

  const shown = () => JSON.parse(screen.getByTestId('sub').textContent!)
  const live = () => ctl.handle!.v.current as Val
  return { App, Sub, armed, ctl, renders, shown, live }
}

afterEach(cleanup)

// --- Cases -------------------------------------------------------------------------------------

describe.each(IMPLS)('use-context-selector (%s)', (label, impl) => {
  it('re-renders a subscriber only when its own selection changes (patched)', () => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    const before = h.renders.count
    act(() => h.ctl.setValue!(V(0, 7))) // b changes; the subscriber selects a
    const unrelated = h.renders.count - before
    if (label === 'patched') expect(unrelated).toBe(0)
    else expect(unrelated).toBeGreaterThan(0) // the cost being removed
    act(() => h.ctl.setValue!(V(3, 7)))
    expect(h.shown()).toBe(3)
  })

  it('rapid successive updates settle on the latest value, in one batch and across batches', () => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    act(() => {
      h.ctl.setValue!(V(1, 0))
      h.ctl.setValue!(V(0, 0)) // A → B → A in one batch
    })
    expect(h.shown()).toBe(0)
    act(() => h.ctl.setValue!(V(1, 0)))
    act(() => h.ctl.setValue!(V(2, 0)))
    act(() => h.ctl.setValue!(V(3, 0))) // A → B → C across batches
    expect(h.shown()).toBe(3)
    act(() => h.ctl.setValue!(V(4, 0)))
    act(() => h.ctl.setValue!(V(3, 1))) // back to the same selection, different value
    expect(h.shown()).toBe(selA(h.live()))
  })

  it.each([
    ['only the new selector’s slice', V(0, 1)],
    ['both slices', V(1, 1)],
    ['neither slice', V(0, 0)],
  ])('selector switch with a notification in the render-to-commit window: %s', (_, next) => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    h.armed.value = next
    act(() => h.ctl.setSel!(selB))
    expect(h.shown()).toBe(selB(h.live()))
  })

  it('a selector that depends on a prop settles after it changes together with the value', () => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    act(() => {
      h.ctl.setSel!(selB)
      h.ctl.setValue!(V(0, 4))
    })
    expect(h.shown()).toBe(4)
  })

  it('an update abandoned by a suspended transition settles on the latest value', async () => {
    const h = harness(impl)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    function Gate({ on }: { on: boolean }) {
      if (on) React.use(gate)
      return null
    }
    const gateCtl: { setOn?: (on: boolean) => void } = {}
    function Host() {
      const [on, setOn] = React.useState(false)
      gateCtl.setOn = setOn
      return (
        <h.App sel={selA}>
          <React.Suspense fallback={<i>waiting</i>}>
            <Gate on={on} />
          </React.Suspense>
        </h.App>
      )
    }
    render(<Host />)
    await act(async () =>
      React.startTransition(() => {
        h.ctl.setValue!(V(1, 0))
        gateCtl.setOn!(true)
      }),
    )
    await act(async () => h.ctl.setValue!(V(2, 0))) // an urgent change while the transition is held
    expect(h.shown()).toBe(selA(h.live()))
    await act(async () => release())
    expect(h.shown()).toBe(2)
  })

  it('switching context sources follows the new provider only', () => {
    const A = impl.createContext<Val>(V(1, 0))
    const B = impl.createContext<Val>(V(2, 0))
    const ctl: { setCtx?: (c: { c: React.Context<Val> }) => void } = {}
    const setters: Record<string, React.Dispatch<React.SetStateAction<Val>>> = {}
    const handles: Record<string, Handle> = {}
    let renders = 0
    const Sub = React.memo(function Sub({ ctx }: { ctx: React.Context<Val> }) {
      renders++
      return <span data-testid="sub">{String(impl.useContextSelector(ctx, selA))}</span>
    })
    function Probe() {
      handles.A = handleOf(impl, React.useContext(A))
      handles.B = handleOf(impl, React.useContext(B))
      return null
    }
    function Host() {
      const [a, setA] = React.useState(V(1, 0))
      const [b, setB] = React.useState(V(2, 0))
      const [ctx, setCtx] = React.useState({ c: A })
      setters.A = setA
      setters.B = setB
      ctl.setCtx = setCtx
      return (
        <A.Provider value={a}>
          <B.Provider value={b}>
            <Probe />
            <Sub ctx={ctx.c} />
          </B.Provider>
        </A.Provider>
      )
    }
    render(<Host />)
    expect(screen.getByTestId('sub').textContent).toBe('1')
    act(() => ctl.setCtx!({ c: B }))
    expect(screen.getByTestId('sub').textContent).toBe('2')
    expect(handles.A!.l.size).toBe(0)
    expect(handles.B!.l.size).toBe(1)
    const before = renders
    act(() => setters.A!(V(9, 0)))
    expect(screen.getByTestId('sub').textContent).toBe('2')
    if (label === 'patched') expect(renders).toBe(before)
    act(() => setters.B!(V(5, 0)))
    expect(screen.getByTestId('sub').textContent).toBe('5')
  })

  it('unmounting removes the listener; later updates neither touch it nor warn', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const h = harness(impl)
      render(<h.App sel={selA} />)
      expect(h.ctl.handle!.l.size).toBe(1)
      act(() => h.ctl.setShow!(false))
      expect(h.ctl.handle!.l.size).toBe(0)
      const before = h.renders.count
      act(() => h.ctl.setValue!(V(5, 5)))
      expect(h.renders.count).toBe(before)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('a selector that throws on the new value reaches the error boundary', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
        state = { failed: false }
        static getDerivedStateFromError() {
          return { failed: true }
        }
        render() {
          return this.state.failed ? <b data-testid="failed">failed</b> : this.props.children
        }
      }
      const throwing: Sel = (v) => {
        if (v.a === 13) throw new Error('unlucky')
        return v.a
      }
      const h = harness(impl)
      function Host() {
        return (
          <h.App sel={selB}>
            <Boundary>
              <h.Sub sel={throwing} id="throwing" />
            </Boundary>
          </h.App>
        )
      }
      render(<Host />)
      act(() => h.ctl.setValue!(V(13, 0)))
      expect(screen.getByTestId('failed')).toBeTruthy()
      expect(h.shown()).toBe(0)
    } finally {
      errors.mockRestore()
    }
  })

  it('a plain update through the provider’s updater settles on the latest value', () => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    act(() => h.ctl.handle!.u(() => h.ctl.setValue!(V(6, 0))))
    expect(h.shown()).toBe(6)
  })

  it('a suspense update suspends, then settles on the latest value', async () => {
    const h = harness(impl)
    render(
      <React.Suspense fallback={<i data-testid="fallback">waiting</i>}>
        <h.App sel={selA} />
      </React.Suspense>,
    )
    await act(async () => h.ctl.handle!.u(() => h.ctl.setValue!(V(8, 0)), { suspense: true }))
    expect(h.shown()).toBe(8)
  })

  it('a selector that returns a new object on every call settles without looping', () => {
    const h = harness(impl)
    const fresh: Sel = (v) => ({ a: v.a })
    render(<h.App sel={fresh} />)
    const before = h.renders.count
    h.armed.value = V(4, 0) // also exercise the catch-up path with an allocating selector
    act(() => h.ctl.setValue!(V(3, 0)))
    expect(h.shown()).toEqual(fresh(h.live()))
    expect(h.renders.count - before).toBeLessThan(10)
  })

  it('StrictMode registers exactly one listener per subscriber', () => {
    const h = harness(impl)
    render(
      <React.StrictMode>
        <h.App sel={selA} />
      </React.StrictMode>,
    )
    expect(h.ctl.handle!.l.size).toBe(1)
    act(() => h.ctl.setValue!(V(2, 0)))
    expect(h.ctl.handle!.l.size).toBe(1)
    expect(h.shown()).toBe(2)
  })
})

describe('the render-to-commit window needs the catch-up check (Codex P1)', () => {
  // The subscriber mounts under an already-mounted provider, and a notification lands in that mount
  // commit before the subscriber's listener is registered. (Mounting provider and subscriber together
  // would not test this: the provider's own mount effect runs last and re-publishes its prop.)
  it.each([
    ['patched', patched, 5],
    ['original', original, 0],
    ['§3.2 prototype', prototype, 0],
  ] as const)('a notification while subscribing: %s', (_, impl, expected) => {
    const h = harness(impl)
    render(<h.App sel={selA} />)
    act(() => h.ctl.setShow!(false))
    h.armed.value = V(5, 0)
    act(() => h.ctl.setShow!(true))
    expect(selA(h.live())).toBe(5)
    // Only the patched hook catches up; the original library shares this window and stays stale.
    expect(h.shown()).toBe(expected)
  })

  it('the §3.2 prototype, without the check, misses the forced selector-switch case', () => {
    const h = harness(prototype)
    render(<h.App sel={selA} />)
    h.armed.value = V(0, 1)
    act(() => h.ctl.setSel!(selB))
    expect(selB(h.live())).toBe(1)
    expect(h.shown()).toBe(0) // stale: the bug the catch-up check fixes
  })
})
