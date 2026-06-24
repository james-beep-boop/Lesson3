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
  /** Max status polls before giving up (default ~90s at the endpoint's suggested 1.5s cadence). */
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

/**
 * Download an export. Prepares via POST (ready immediately, or 202 → poll), then downloads via a
 * GET of the now-warm .zip. Resolves once the download has been triggered; rejects with a
 * user-facing message on failure (incl. 429 rate-limit and job errors). Drives `onState` through
 * preparing → downloading.
 */
export async function downloadExport(exportUrl: string, opts: DownloadOpts = {}): Promise<void> {
  const { onState = () => {}, maxPolls = 60 } = opts
  const fallbackName = 'export.zip'

  // Download the (now-warm) zip via the idempotent GET. Shared by the ready and polled paths.
  const fetchAndSave = async (): Promise<void> => {
    onState('downloading')
    const dl = await fetch(exportUrl, { credentials: 'same-origin' })
    if (dl.status !== 200) {
      const msg = await messageFrom(dl, 'Export could not be downloaded.')
      onState('error', msg)
      throw new Error(msg)
    }
    saveBlob(await dl.blob(), filenameFrom(dl, fallbackName))
    onState('idle')
  }

  // Phase 1: prepare via POST — the only state-changing call (CSRF-guarded by SameSite=Lax).
  onState('preparing')
  const prep = await fetch(exportUrl, { method: 'POST', credentials: 'same-origin' })

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

  // WARM: artifacts already cached — download straight away.
  if (prep.status === 200 && prepBody.state === 'ready') {
    await fetchAndSave()
    return
  }

  // COLD (202): poll the status URL until the artifacts are ready, then download.
  const cadence = prepBody.retryAfterMs ?? 1500
  const statusUrl = prepBody.statusUrl
  if (!statusUrl) {
    const msg = 'Export failed — please try again.'
    onState('error', msg)
    throw new Error(msg)
  }

  for (let i = 0; i < maxPolls; i++) {
    await sleep(cadence)
    const poll = await fetch(statusUrl, { credentials: 'same-origin' })
    const body = (await poll.json().catch(() => ({}))) as { state?: string; message?: string }
    if (body.state === 'ready') {
      await fetchAndSave()
      return
    }
    if (body.state === 'error') {
      const msg = body.message ?? 'Export failed — please try again.'
      onState('error', msg)
      throw new Error(msg)
    }
    // else 'preparing' → keep polling
  }

  const timeoutMsg = 'Export is taking longer than expected — please try again.'
  onState('error', timeoutMsg)
  throw new Error(timeoutMsg)
}
