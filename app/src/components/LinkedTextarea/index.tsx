'use client'

/**
 * Native prose textarea with optional labelled ARES/web link insertion.
 *
 * The underlying field remains Payload's native textarea and stores an ordinary string. Placing the
 * cursor here enables the editor toolbar's single Insert link action; this field then inserts
 * `(https://…)` from either a typed internet address or a server-issued PDF-library URL. There is no
 * rich text or hidden link metadata, so versioning, field-level access and edit recovery keep their
 * existing contracts.
 */
import type { TextareaFieldClientProps } from 'payload'

import { Button, TextareaField, useConfig, useField } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

import { apiBaseFrom } from '../../lib/apiBase'
import Modal from '../Modal'
import { activateLinkTarget, clearActiveLinkTarget } from './activeTarget'
import { insertParenthesizedUrl, labelError, validExternalUrl } from './insertLink'

import { normalizeAresAddress, type AresAddresses } from './aresAddress'

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

export default function LinkedTextarea(
  props: TextareaFieldClientProps & {
    aresAddresses?: AresAddresses
  },
) {
  const { path, readOnly, aresAddresses, ...fieldProps } = props
  const { value, setValue, disabled } = useField<string>({ path })
  const { config } = useConfig()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef(0)
  const targetId = useRef(Symbol(path))
  const [open, setOpen] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [label, setLabel] = useState('')
  const [configured, setConfigured] = useState(false)
  const [files, setFiles] = useState<PdfResource[]>([])
  const [error, setError] = useState<string | null>(null)

  const textarea = (): HTMLTextAreaElement | null =>
    wrapperRef.current?.querySelector('textarea') ?? null

  const showDialog = async () => {
    setOpen(true)
    setError(null)
    setWebUrl('')
    setLabel('')
    setConfigured(false)
    setFiles([])
    try {
      const response = await fetch(`${apiBaseFrom(config)}/resource-library`, {
        credentials: 'same-origin',
      })
      const body = (await response.json().catch(() => ({}))) as LibraryResponse
      if (!response.ok) {
        setError('Could not load PDFs from the Rock. You can still paste a web address.')
      } else if ('files' in body) {
        setConfigured(body.configured)
        setFiles(body.files)
      }
    } catch {
      setError('Could not load PDFs from the Rock. You can still paste a web address.')
    }
  }

  const insert = (url: string) => {
    const invalidLabel = labelError(label)
    if (invalidLabel) {
      setError(invalidLabel)
      return
    }
    const result = insertParenthesizedUrl(String(value ?? ''), cursorRef.current, url, label)
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
      setError('Enter a complete web address starting with http:// or https://.')
      return
    }
    insert(normalizeAresAddress(url, aresAddresses))
  }

  const rememberAsTarget = (eventTarget: EventTarget | null) => {
    const input = textarea()
    if (!input || eventTarget !== input || readOnly || disabled || input.readOnly || input.disabled)
      return
    cursorRef.current = input.selectionStart ?? String(value ?? '').length
    activateLinkTarget({ id: targetId.current, openDialog: () => void showDialog() })
  }

  // A field must not leave the toolbar pointing at an unmounted or newly read-only component.
  useEffect(() => {
    const id = targetId.current
    if (readOnly || disabled) clearActiveLinkTarget(id)
    return () => clearActiveLinkTarget(id)
  }, [disabled, readOnly])

  return (
    <div
      ref={wrapperRef}
      className="prose-link-field"
      onFocusCapture={(event) => rememberAsTarget(event.target)}
      onKeyUpCapture={(event) => rememberAsTarget(event.target)}
      onMouseUpCapture={(event) => rememberAsTarget(event.target)}
      onSelectCapture={(event) => rememberAsTarget(event.target)}
    >
      <TextareaField {...fieldProps} path={path} readOnly={readOnly} />

      {open && (
        <Modal title="Insert link" className="prose-link-dialog" onClose={() => setOpen(false)}>
          <p className="modal__body">
            <strong>New feature.</strong> Paste an address from ARES or the web. It is added to the
            text in brackets and becomes a clickable link in the Word and PDF documents. Tell your
            administrator if a link does not work.
          </p>
          <label className="modal__field">
            <span>Web address</span>
            <input
              type="url"
              inputMode="url"
              placeholder="http://ares.local/modules/…"
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
          <label className="modal__field">
            <span>Label (optional)</span>
            <input
              type="text"
              placeholder="Plant transport video"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  insertWebUrl()
                }
              }}
            />
            <small>Leave blank to insert just the address.</small>
          </label>
          <div className="modal__actions">
            <Button className="lp-btn" buttonStyle="primary" size="small" onClick={insertWebUrl}>
              Insert address
            </Button>
          </div>

          {configured && (
            <>
              <div className="prose-link-dialog__divider" role="separator">
                PDFs on the Rock
              </div>
              {files.length > 0 ? (
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
            </>
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
