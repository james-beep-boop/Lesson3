'use client'

/**
 * UploadBundles — Site-Admin-only panel above the Lesson Plans list (SPEC §7 deviation;
 * see docs/DECISIONS.md). Injected via admin.components.beforeListTable.
 *
 * Renders NOTHING unless the current user is a Site Administrator (`roles` includes
 * 'siteAdmin' — saveToJWT, so it's on the client user). This hides the control as requested;
 * the real authorization boundary is the server endpoint (POST /api/lesson-plans/upload),
 * which re-checks isSiteAdmin. Accepts ARES `.json` exports and ZIP archives and creates Official 1.0.0
 * lesson-plan versions.
 */
import React, { useRef, useState } from 'react'
import { Button, toast, useAuth, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

type UploadResult = {
  file: string
  id: number | string
  title: string
  semver: string
  official: boolean
  action: 'created' | 'revised'
  warnings: string[]
}

type FileIssue = { file: string; error: string }
type UploadReport = {
  ok: boolean
  count: number
  bundles: UploadResult[]
  rejected?: FileIssue[]
  skipped?: FileIssue[]
  error?: string
  errors?: { message?: string }[]
}

export default function UploadBundles() {
  const { user } = useAuth()
  const { config } = useConfig()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [report, setReport] = useState<UploadReport | null>(null)
  const clearReport = () => {
    setResults([])
    setReport(null)
  }
  const inputRef = useRef<HTMLInputElement>(null)

  // Site Admin only — invisible to everyone else (server still enforces independently).
  const roles = (user as { roles?: string[] } | null | undefined)?.roles
  if (!roles?.includes('siteAdmin')) return null

  const apiBase = `${config.serverURL || ''}${config.routes?.api || '/api'}`

  const onUpload = async () => {
    if (files.length === 0) {
      toast.error('Choose .json files or a .zip archive first')
      return
    }
    const form = new FormData()
    for (const f of files) form.append('files', f)

    setBusy(true)
    clearReport()
    try {
      const res = await fetch(`${apiBase}/lesson-plans/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      const json = (await res.json()) as UploadReport
      // A completed report can have no successes (422), or both imports and rejections (200).
      if (
        !Array.isArray(json.bundles) ||
        !Array.isArray(json.rejected) ||
        (res.status !== 200 && res.status !== 422)
      ) {
        toast.error(json.error || json.errors?.[0]?.message || `Upload failed (${res.status})`)
        return
      }
      setReport(json)
      setResults(json.bundles)
      const rejected = json.rejected?.length ?? 0
      const skipped = json.skipped?.length ?? 0
      const message = `Imported ${json.count} file(s); rejected ${rejected}; skipped ${skipped}.`
      if (json.count > 0) toast.success(message)
      else toast.error(message)
      // Reset the picker so the button returns to its disabled "Upload" state and the same
      // files can't be re-submitted by accident. (Clearing state alone won't clear the native
      // input's "N files" label — reset its value too.)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      if (json.count > 0) router.refresh() // reflect the new lesson plans in the list
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 4,
        padding: '1rem',
        marginBottom: '1rem',
        background: 'var(--theme-elevation-50)',
      }}
    >
      {/* Heading lives on Manage ("Upload lesson plans"); not repeated here. `lp-manage__desc` is the
          shared help-text class the sibling panels use — the inline style it replaces had drifted to
          0.85rem (13.6px) against the 14px token and had no max-width measure. */}
      <p className="lp-manage__desc">
        Site administrator only. Choose ARES <code>.json</code> exports or <code>.zip</code>{' '}
        archives containing JSON files, including files in folders. Valid files are imported even if
        others fail. New plans become Official 1.0.0; revisions require Make Official. Up to 50 JSON
        files, 5 MB per JSON file and 50 MB per ZIP. Review the report below after uploading.
      </p>
      {/* Classed, not inline-styled: the class is what lets the shared admin button block reach
          Upload. It was the last control on Manage rendering as stock Payload (operator report,
          2026-08-02) — measured 29.08px against the system's 38px. */}
      <div className="lp-manage__upload">
        <input
          ref={inputRef}
          type="file"
          className="lp-manage__file"
          accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
          multiple
          disabled={busy}
          // The PREVIOUS upload's result list is cleared the moment the picker is opened, not when
          // new files arrive (operator report 2026-08-02): the old filenames stayed on screen after
          // a successful upload, so the panel read as though those files were queued again. `onClick`
          // fires when the OS dialog opens, so the stale list goes even if the admin then cancels —
          // which is the case `onChange` alone would miss. `onChange` clears too, for the paths that
          // set files without a click (drag-drop, programmatic).
          onClick={clearReport}
          onChange={(e) => {
            clearReport()
            setFiles(e.target.files ? Array.from(e.target.files) : [])
          }}
        />
        <Button
          className="lp-btn"
          buttonStyle="secondary"
          size="small"
          onClick={onUpload}
          disabled={busy || files.length === 0}
        >
          {busy ? 'Uploading…' : `Upload${files.length ? ` ${files.length} file(s)` : ''}`}
        </Button>
      </div>
      {report && (
        <div role="status" style={{ marginTop: '0.75rem' }}>
          Imported {report.count} file(s); rejected {report.rejected?.length ?? 0}; skipped{' '}
          {report.skipped?.length ?? 0}.
        </div>
      )}
      {results.length > 0 && (
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
          {results.map((r, i) => (
            <li key={`${r.id}-${i}`}>
              {r.file} · {r.action === 'revised' ? 'Revised' : 'New'} · #{r.id} · {r.title} (
              {r.semver}, {r.official ? 'Official' : 'Not Official'})
              {r.warnings.length > 0 && (
                <span style={{ color: 'var(--theme-warning-600, #a60)' }}>
                  {' '}
                  · Warning: {r.warnings.length} deliverable warning(s)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(report?.rejected?.length ?? 0) > 0 && (
        <div>
          <p>Rejected files</p>
          <ul>
            {report?.rejected?.map((r, i) => (
              <li key={i}>
                <strong>{r.file}</strong>: <span style={{ whiteSpace: 'pre-wrap' }}>{r.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(report?.skipped?.length ?? 0) > 0 && (
        <div>
          <p>Skipped files</p>
          <ul>
            {report?.skipped?.map((r, i) => (
              <li key={i}>
                {r.file}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
