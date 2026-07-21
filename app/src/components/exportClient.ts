/**
 * Client-side export driver (SPEC §9). Export is two-phase AND split by HTTP method (audit #3):
 * the side-effecting "prepare" is a **POST** (CSRF-guarded by the SameSite=Lax cookie); the
 * download is an idempotent **GET**. A plain `<a href>` can't follow that, so the admin button and
 * the teacher links both call this:
 *   POST `…/export` → 200 {ready} download via GET · 202 → poll status → download via GET.
 * Reports progress so the UI can show "Preparing…". Same-origin fetch carries the auth cookie, so
 * both requests still see `req.user`.
 */
export type ExportState = 'idle' | 'preparing' | 'downloading' | 'error'

interface DownloadOpts {
  onState?: (state: ExportState, message?: string) => void
  /** Max status polls before giving up (default ~150s at the endpoint's suggested 1.5s cadence). */
  maxPolls?: number
}

/** Pull the server-suggested filename out of Content-Disposition, with a safe fallback. */
function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename="?([^"]+)"?/i.exec(cd)
  return m?.[1] ?? fallback
}

/** Trigger a browser download of a blob without navigating away from the current page. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after a tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.clone().json()) as { errors?: { message?: string }[]; message?: string }
    return body.errors?.[0]?.message ?? body.message ?? fallback
  } catch {
    return fallback
  }
}

/** Turn transport failures into the same visible error state as HTTP/job failures. */
async function fetchExport(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  onState: NonNullable<DownloadOpts['onState']>,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    const msg = 'Could not reach the export service — check your connection and try again.'
    onState('error', msg)
    throw new Error(msg)
  }
}

/**
 * Ensure the (version, kind) export named by `exportUrl` is warm: prepare via POST (ready
 * immediately, or 202 → poll status until ready). Resolves once artifacts are cached; rejects
 * with a user-facing message on failure (incl. 429 rate-limit and job errors). Drives `onState`
 * through 'preparing' and 'error' only — what happens next (zip download, per-document open) is
 * the caller's. Shared by `downloadExport` and the per-document buttons (teacher-first T2).
 */
export async function ensureExportReady(exportUrl: string, opts: DownloadOpts = {}): Promise<void> {
  // Gotenberg may legitimately spend up to 120s converting one PDF; leave queue/startup headroom
  // and match the HTTP suite's 150s cold-export budget instead of timing out first at ~90s.
  const { onState = () => {}, maxPolls = 100 } = opts

  // Phase 1: prepare via POST — the only state-changing call (CSRF-guarded by SameSite=Lax).
  onState('preparing')
  const prep = await fetchExport(
    exportUrl,
    { method: 'POST', credentials: 'same-origin' },
    onState,
  )

  if (prep.status === 429) {
    const msg = await messageFrom(prep, 'Too many requests — please wait and try again.')
    onState('error', msg)
    throw new Error(msg)
  }
  if (prep.status !== 200 && prep.status !== 202) {
    const msg = await messageFrom(prep, `Export failed (${prep.status}).`)
    onState('error', msg)
    throw new Error(msg)
  }

  const prepBody = (await prep.json().catch(() => ({}))) as {
    state?: string
    statusUrl?: string
    retryAfterMs?: number
  }

  // WARM: artifacts already cached.
  if (prep.status === 200 && prepBody.state === 'ready') return

  // COLD (202): poll the status URL until the artifacts are ready.
  const cadence = prepBody.retryAfterMs ?? 1500
  const statusUrl = prepBody.statusUrl
  if (!statusUrl) {
    const msg = 'Export failed — please try again.'
    onState('error', msg)
    throw new Error(msg)
  }

  for (let i = 0; i < maxPolls; i++) {
    await sleep(cadence)
    const poll = await fetchExport(statusUrl, { credentials: 'same-origin' }, onState)
    const body = (await poll.json().catch(() => ({}))) as {
      errors?: { message?: string }[]
      state?: string
      message?: string
    }
    if (body.state === 'error') {
      const msg = body.message ?? 'Export failed — please try again.'
      onState('error', msg)
      throw new Error(msg)
    }
    if (!poll.ok) {
      const msg =
        body.errors?.[0]?.message ??
        body.message ??
        `Could not check export status (${poll.status}).`
      onState('error', msg)
      throw new Error(msg)
    }
    if (body.state === 'ready') return
    // else 'preparing' → keep polling
  }

  const timeoutMsg = 'Export is taking longer than expected — please try again.'
  onState('error', timeoutMsg)
  throw new Error(timeoutMsg)
}

/** Message shown when the browser refuses BOTH the synchronous open and the post-await retry. */
const POPUP_BLOCKED_MESSAGE =
  'Your browser blocked the preview window. Allow pop-ups for this site, then try again.'

/**
 * Hand `url` to the placeholder tab opened during the click gesture, or — if that open was blocked —
 * try once more now.
 *
 * THE RETRY MUST BE CHECKED. It runs after an `await`, which is exactly the case popup blockers
 * reject, so it is EXPECTED to fail under strict blocking. Both callers previously ignored its
 * result, which meant a blocked preview resolved successfully: the caller cleared its busy state and
 * the user saw nothing at all, with no error to explain it. Silent success is the worst outcome for
 * this feature, so a blocked retry throws and the caller surfaces it.
 *
 * Shared because the two `open*InNewTab` functions are deliberate twins. When only one of them was
 * fixed (2026-07-21) the other kept the silent-success bug AND the stale comment claiming the retry
 * was fine — with the divergence invisible, since the mirroring is asserted in prose rather than
 * structure. One helper is what actually keeps them mirrored.
 */
function deliverToTab(tab: Window | null, url: string): void {
  if (tab) {
    tab.location.href = url
    return
  }
  if (!window.open(url, '_blank')) throw new Error(POPUP_BLOCKED_MESSAGE)
}

/**
 * Open an export PDF inline in a NEW TAB: warm the (version, kind) cache (`ensureExportReady`), then
 * navigate the tab to `docUrl` (served `Content-Disposition: inline`). The tab is opened SYNCHRONOUSLY
 * so popup blockers allow it, shows a "Preparing…" note while the cache warms, and is closed on
 * failure (the error is re-thrown for the caller to surface). Shared by the teacher-facing per-document
 * button (`DocButtons`) and the editor toolbar's "View as PDF" (pristine path).
 */
export async function openPreparedPdfInNewTab(exportUrl: string, docUrl: string): Promise<void> {
  // Synchronous open — inside the click handler, so popup blockers allow it.
  const tab = window.open('', '_blank')
  if (tab) {
    tab.document.title = 'Preparing document…'
    tab.document.body.textContent = 'Preparing document…'
  }
  try {
    await ensureExportReady(exportUrl)
    deliverToTab(tab, docUrl)
  } catch (e) {
    tab?.close()
    throw e
  }
}


/**
 * Open a GENERATED (not cached) PDF in a new tab — the unsaved working-copy twin of
 * `openPreparedPdfInNewTab` above, whose tab choreography it deliberately mirrors.
 *
 * WHY THIS EXISTS (audit 2026-07-20, L3-12). The unsaved "View as PDF" previously submitted a
 * hidden form to `_blank` — fire-and-forget, so the client could not observe completion and gated
 * re-clicks on a FIXED 3-SECOND timer. Measured on the Rock, a 12-lesson conversion takes
 * **5.3–6.9 s** (11.3 s queued behind a busy slot), so the button re-enabled mid-conversion on
 * essentially every production preview. A user staring at an apparently-ready button clicks again,
 * that second click consumes the other conversion slot, and a third attempt renders the endpoint's
 * raw JSON 503 as the whole page of a new tab.
 *
 * Fetching instead makes completion observable: the caller can hold its busy state until the request
 * SETTLES, show a real spinner for the full 5–11 s, and render errors inline rather than as a raw
 * JSON tab. The conversion cap of 2 is NOT the problem and is not touched — Gotenberg saturates a
 * core per conversion against a `cpus=2.0` budget, so raising it would only make everything slower.
 *
 * The tab MUST be opened synchronously inside the click gesture (as here) — `window.open` after an
 * `await` is blocked by popup blockers, which is why this cannot simply be `fetch().then(open)`.
 */
export async function openGeneratedPdfInNewTab(url: string, body: FormData): Promise<void> {
  // Synchronous open — inside the click handler, so popup blockers allow it.
  const tab = window.open('', '_blank')
  if (tab) {
    tab.document.title = 'Preparing document…'
    tab.document.body.textContent = 'Preparing document…'
  }
  try {
    const res = await fetch(url, { method: 'POST', body, credentials: 'same-origin' })
    if (!res.ok) throw new Error(await messageFrom(res, `Could not prepare the PDF (${res.status}).`))
    const blobUrl = URL.createObjectURL(await res.blob())
    try {
      deliverToTab(tab, blobUrl)
    } catch (e) {
      URL.revokeObjectURL(blobUrl) // nothing will load it; don't leak the blob for a minute
      throw e
    }
    // Revoke on a delay, never immediately: the tab still has to LOAD from this URL, and revoking
    // before it does leaves a blank tab. A minute is far longer than any load and bounds the leak.
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } catch (e) {
    tab?.close() // don't strand a "Preparing…" tab the user has to clean up
    throw e
  }
}

/**
 * Download an export .zip. Ensures the artifacts are warm (`ensureExportReady`), then downloads
 * via the idempotent GET. Resolves once the download has been triggered; rejects with a
 * user-facing message on failure. Drives `onState` through preparing → downloading.
 */
export async function downloadExport(exportUrl: string, opts: DownloadOpts = {}): Promise<void> {
  const { onState = () => {} } = opts
  await ensureExportReady(exportUrl, opts)

  onState('downloading')
  const dl = await fetchExport(exportUrl, { credentials: 'same-origin' }, onState)
  if (dl.status !== 200) {
    const msg = await messageFrom(dl, 'Export could not be downloaded.')
    onState('error', msg)
    throw new Error(msg)
  }
  saveBlob(await dl.blob(), filenameFrom(dl, 'export.zip'))
  onState('idle')
}
