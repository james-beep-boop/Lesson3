'use client'

import { Button, useConfig } from '@payloadcms/ui'
import { useState } from 'react'

import type { SupportingFileReport } from '@/ingest/importSupportingFiles'

export default function ImportSupportingFiles() {
  const { config } = useConfig()
  const [files, setFiles] = useState<File[]>([])
  const [report, setReport] = useState<SupportingFileReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function choose(input: HTMLInputElement) {
    if (!input.files?.length) return
    setFiles(Array.from(input.files))
    setReport(null)
    setError('')
    input.value = ''
  }

  async function submit(confirmation?: string) {
    const body = new FormData()
    for (const file of files) body.append('files', file)
    if (confirmation) body.append('confirm', confirmation)
    setBusy(true)
    setError('')
    try {
      const url = `${config.serverURL || ''}${config.routes?.api || '/api'}/supporting-files/import`
      const response = await fetch(url, { method: 'POST', body, credentials: 'include' })
      const result = await response.json()
      if (!response.ok && (response.status !== 409 || !Array.isArray(result.rows))) {
        setError(result.errors?.[0]?.message ?? 'Could not check or import the files.')
        return
      }
      setReport(result)
      if (response.status === 409) {
        setError('The report changed. Check the new list before importing.')
      }
    } catch {
      setError('Could not check or import the files. Try checking them again.')
    } finally {
      setBusy(false)
    }
  }

  const matched = report?.rows.filter((row) => row.status === 'matched') ?? []
  const alreadyHere = report?.rows.filter((row) => row.status === 'alreadyHere') ?? []
  const unmatched = report?.rows.filter((row) => row.status === 'unmatched') ?? []
  const groups = [
    { title: report?.imported ? 'Imported' : 'Matched', rows: matched },
    { title: 'Already here', rows: alreadyHere },
    { title: 'Unmatched', rows: unmatched },
  ]

  return (
    <>
      <p className="lp-manage__desc">
        Choose a ZIP file or a folder of Word and PDF files. Check where they will go before you
        import them.
      </p>
      <div className="lp-manage__upload">
        <label>
          ZIP file{' '}
          <input
            type="file"
            accept=".zip"
            className="lp-manage__file"
            disabled={busy}
            onChange={(event) => choose(event.currentTarget)}
          />
        </label>
        <label>
          Folder{' '}
          <input
            type="file"
            ref={(input) => input?.setAttribute('webkitdirectory', '')}
            className="lp-manage__file"
            disabled={busy}
            onChange={(event) => choose(event.currentTarget)}
          />
        </label>
        <Button
          className="lp-btn"
          buttonStyle="secondary"
          size="small"
          onClick={() => submit()}
          disabled={busy || !files.length}
        >
          Check files
        </Button>
        {files.length > 0 && <span>{files.length} selected</span>}
      </div>
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <div className="lp-upload-confirm">
          <p role="status">
            {report.imported
              ? `Imported ${report.imported} files.`
              : 'Check the report before importing. Nothing has been added.'}
          </p>
          {groups.map(({ title, rows }) => (
            <details key={title} open={rows.length > 0 && rows.length <= 10}>
              <summary>
                {title} ({rows.length})
              </summary>
              <ul style={{ overflowWrap: 'anywhere' }}>
                {rows.map((row, index) => (
                  <li key={index}>
                    {row.file}
                    {'attachment' in row &&
                      ` → ${row.attachment.title}${
                        row.attachment.lessonNumber === null
                          ? ' (whole sub-strand)'
                          : `, lesson ${row.attachment.lessonNumber}`
                      }`}
                    {row.reason && ` — ${row.reason}`}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {matched.length > 0 && !report.imported && (
            <Button
              className="lp-btn"
              buttonStyle="primary"
              size="small"
              disabled={busy}
              onClick={() => submit(report.previewToken)}
            >
              Import matched files
            </Button>
          )}
        </div>
      )}
    </>
  )
}
