/**
 * Client-side export driver (SPEC §9). The export endpoint is now two-phase: a warm request
 * returns the .zip (200); a cold request returns 202 + a status URL while the `generateArtifact`
 * job runs. A plain `<a href>`/navigation can't follow that handshake, so the admin button and
 * the teacher download links both call this: fetch → if 200 download; if 202 poll the status URL
 * until ready, then fetch once more to download. Reports progress so the UI can show "Preparing…".
 *
 * Same-origin fetch carries the auth cookie, so the endpoint still sees `req.user`.
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
 * Download an export, following the warm (200) or cold (202 → poll → 200) path. Resolves once
 * the file download has been triggered; rejects with a user-facing message on failure (incl. 429
 * rate-limit and job errors). Drives `onState` through preparing → downloading.
 */
export async function downloadExport(exportUrl: string, opts: DownloadOpts = {}): Promise<void> {
  const { onState = () => {}, maxPolls = 60 } = opts
  const fallbackName = 'export.zip'

  onState('downloading')
  const first = await fetch(exportUrl, { credentials: 'same-origin' })

  if (first.status === 200) {
    saveBlob(await first.blob(), filenameFrom(first, fallbackName))
    onState('idle')
    return
  }

  if (first.status === 429) {
    const msg = await messageFrom(first, 'Too many requests — please wait and try again.')
    onState('error', msg)
    throw new Error(msg)
  }

  if (first.status !== 202) {
    const msg = await messageFrom(first, `Export failed (${first.status}).`)
    onState('error', msg)
    throw new Error(msg)
  }

  // Cold path: poll the status URL until the artifacts are ready, then re-fetch to download.
  const { statusUrl, retryAfterMs } = (await first.json()) as {
    statusUrl: string
    retryAfterMs?: number
  }
  const cadence = retryAfterMs ?? 1500
  onState('preparing')

  for (let i = 0; i < maxPolls; i++) {
    await sleep(cadence)
    const poll = await fetch(statusUrl, { credentials: 'same-origin' })
    const body = (await poll.json().catch(() => ({}))) as { state?: string; message?: string }
    if (body.state === 'ready') {
      onState('downloading')
      const dl = await fetch(exportUrl, { credentials: 'same-origin' })
      if (dl.status !== 200) {
        const msg = await messageFrom(dl, 'Export could not be downloaded.')
        onState('error', msg)
        throw new Error(msg)
      }
      saveBlob(await dl.blob(), filenameFrom(dl, fallbackName))
      onState('idle')
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
