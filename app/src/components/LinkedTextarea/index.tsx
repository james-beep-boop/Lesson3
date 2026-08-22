'use client'

/**
 * Payload textarea wrapper for the link proof of concept.
 *
 * The underlying field remains Payload's native textarea and stores an ordinary string. The small
 * control remembers the textarea cursor, then inserts `(https://…)` from either a typed internet
 * address or a server-issued PDF-library URL. There is no rich text, selection tracking or hidden
 * link metadata, so versioning, field-level access and edit recovery keep their existing contracts.
 */
import type { TextareaFieldClientProps } from 'payload'

import { Button, TextareaField, useConfig, useField } from '@payloadcms/ui'
import React, { useRef, useState } from 'react'

import { apiBaseFrom } from '../../lib/apiBase'
import Modal from '../Modal'
import { insertParenthesizedUrl, validExternalUrl } from './insertLink'

type PdfResource = {
  href: string
  name: string
  size: number
}

type LibraryResponse = { configured: boolean; files: PdfResource[] } | { error: string }

const displaySize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function LinkedTextarea(props: TextareaFieldClientProps) {
  const { path, readOnly } = props
  const { value, setValue, disabled } = useField<string>({ path })
  const { config } = useConfig()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [files, setFiles] = useState<PdfResource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const textarea = (): HTMLTextAreaElement | null =>
    wrapperRef.current?.querySelector('textarea') ?? null

  const rememberCursor = () => {
    cursorRef.current = textarea()?.selectionStart ?? String(value ?? '').length
  }

  const showDialog = async () => {
    setOpen(true)
    setError(null)
    setWebUrl('')
    setFiles([])
    setLoading(true)
    try {
      const response = await fetch(`${apiBaseFrom(config)}/resource-library`, {
        credentials: 'same-origin',
      })
      const body = (await response.json().catch(() => ({}))) as LibraryResponse
      if (!response.ok) {
        setError('error' in body ? body.error : 'Could not load PDFs from the Rock.')
      } else if ('files' in body) {
        setFiles(body.files)
      }
    } catch {
      setError('Could not load PDFs from the Rock.')
    } finally {
      setLoading(false)
    }
  }

  const insert = (url: string) => {
    const result = insertParenthesizedUrl(String(value ?? ''), cursorRef.current, url)
    setValue(result.value)
    setOpen(false)
    setError(null)
    window.setTimeout(() => {
      const input = textarea()
      input?.focus()
      input?.setSelectionRange(result.cursor, result.cursor)
    }, 0)
  }

  const insertWebUrl = () => {
    const url = validExternalUrl(webUrl)
    if (!url) {
      setError('Enter a complete https:// web address.')
      return
    }
    insert(url)
  }

  return (
    <div ref={wrapperRef} className="prose-link-field">
      <TextareaField {...props} />
      {!readOnly && !disabled && (
        <span
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') rememberCursor()
          }}
        >
          <Button
            className="lp-btn prose-link-field__trigger"
            buttonStyle="secondary"
            size="small"
            onMouseDown={rememberCursor}
            onClick={showDialog}
            type="button"
          >
            Insert link
          </Button>
        </span>
      )}

      {open && (
        <Modal title="Insert link" className="prose-link-dialog" onClose={() => setOpen(false)}>
          <p className="modal__body">
            The complete address will be inserted in parentheses at the cursor.
          </p>
          <label className="modal__field">
            <span>Internet address</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={webUrl}
              onChange={(event) => {
                setWebUrl(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  insertWebUrl()
                }
              }}
            />
          </label>
          <div className="modal__actions">
            <Button className="lp-btn" buttonStyle="primary" size="small" onClick={insertWebUrl}>
              Insert address
            </Button>
          </div>

          <div className="prose-link-dialog__divider" role="separator">
            PDFs on the Rock
          </div>
          {loading ? (
            <p className="modal__body" role="status">
              Loading PDFs…
            </p>
          ) : files.length > 0 ? (
            <ul className="prose-link-dialog__files">
              {files.map((file) => (
                <li key={file.href}>
                  <button
                    type="button"
                    onClick={() => insert(new URL(file.href, window.location.origin).href)}
                  >
                    <span>{file.name}</span>
                    <small>{displaySize(file.size)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="modal__body">No PDF files are available.</p>
          )}
          {error && (
            <p className="prose-link-dialog__error" role="alert">
              {error}
            </p>
          )}
          <div className="modal__actions prose-link-dialog__close">
            <Button
              className="lp-btn"
              buttonStyle="secondary"
              size="small"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
