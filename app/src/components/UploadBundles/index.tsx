'use client'

/**
 * UploadBundles — Site-Admin-only panel above the Lesson Plans list (SPEC §7 deviation;
 * see docs/DECISIONS.md). Injected via admin.components.beforeListTable.
 *
 * Renders NOTHING unless the current user is a Site Administrator (`roles` includes
 * 'siteAdmin' — saveToJWT, so it's on the client user). This hides the control as requested;
 * the real authorization boundary is the server endpoint (POST /api/lesson-plans/upload),
 * which re-checks isSiteAdmin. Accepts ARES `.json` exports and creates Official 1.0.0
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
  warnings: string[]
}

export default function UploadBundles() {
  const { user } = useAuth()
  const { config } = useConfig()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Site Admin only — invisible to everyone else (server still enforces independently).
  const roles = (user as { roles?: string[] } | null | undefined)?.roles
  if (!roles?.includes('siteAdmin')) return null

  const apiBase = `${config.serverURL || ''}${config.routes?.api || '/api'}`

  const onUpload = async () => {
    if (files.length === 0) {
      toast.error('Choose one or more .json files first')
      return
    }
    const form = new FormData()
    for (const f of files) form.append('files', f)

    setBusy(true)
    setResults([])
    try {
      const res = await fetch(`${apiBase}/lesson-plans/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      const json = (await res.json()) as
        | { ok: true; count: number; bundles: UploadResult[] }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        toast.error('error' in json ? json.error : `Upload failed (${res.status})`)
        return
      }
      setResults(json.bundles)
      toast.success(`Uploaded ${json.count} lesson plan(s) as Official 1.0.0.`)
      // Reset the picker so the button returns to its disabled "Upload" state and the same
      // files can't be re-submitted by accident. (Clearing state alone won't clear the native
      // input's "N files" label — reset its value too.)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      router.refresh() // reflect the new lesson plans in the list
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
      <strong>Upload lesson plans</strong>
      <p style={{ margin: '0.25rem 0 0.75rem', color: 'var(--theme-elevation-600)', fontSize: '0.85rem' }}>
        Site Administrator only. ARES <code>.json</code> exports are validated and saved as
        Official 1.0.0 versions. The upload never executes the file; only JSON data is parsed.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          disabled={busy}
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
        />
        <Button buttonStyle="secondary" size="small" onClick={onUpload} disabled={busy || files.length === 0}>
          {busy ? 'Uploading…' : `Upload${files.length ? ` ${files.length} file(s)` : ''}`}
        </Button>
      </div>
      {results.length > 0 && (
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
          {results.map((r) => (
            <li key={String(r.id)}>
              #{r.id} · {r.title} ({r.semver}, {r.official ? 'Official' : 'Not Official'})
              {r.warnings.length > 0 && (
                <span style={{ color: 'var(--theme-warning-600, #a60)' }}> · Warning: {r.warnings.length} deliverable warning(s)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
