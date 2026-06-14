import type { CollectionBeforeValidateHook } from 'payload'
import { ValidationError } from 'payload'

import { validateGeneratable } from '../ingest/validateGeneratable'

/**
 * Generator-completeness gate as a NATIVE Payload hook (SPEC §13 "Payload-first", §5/§7).
 *
 * Runs `validateGeneratable` automatically on every create/update and BLOCKS the write
 * when the resulting document would be PUBLISHED (i.e. marked official / export-eligible)
 * but is not generatable. Drafts are intentionally allowed through incomplete — a bundle
 * can be a work-in-progress — while ingest's own pre-write check (`ingestItems` pre-flight)
 * still rejects incomplete ARES data up front. So the invariant "no PUBLISHED bundle is ever
 * un-generatable" holds across the admin UI, the Local API, and ingest by construction.
 *
 * `beforeValidate` (not the export path) is the right home: it surfaces problems as a
 * Payload `ValidationError` in the admin UI at publish time, and export then trusts
 * validated-in data. Paired with `enforceBundleStructure` (beforeChange), which owns the
 * Editor/admin field split and array structure.
 */
export const enforceGeneratable: CollectionBeforeValidateHook = ({ data, originalDoc, req }) => {
  if (!data) return data

  // The status the write will land on. Publishing = `_status: 'published'` in data
  // (verified in installed source); a partial update that omits it keeps the original's.
  const status = data._status ?? originalDoc?._status ?? 'draft'
  if (status !== 'published') return data

  // Validate the merged view so a partial publish (e.g. only flipping `_status`) is still
  // checked against the full stored content. Top-level shallow merge is the right grain —
  // `meta` / `lessons` are whole top-level fields.
  const merged = { ...originalDoc, ...data }
  const problems = validateGeneratable(merged)
  if (problems.length > 0) {
    throw new ValidationError(
      {
        collection: 'lesson-bundles',
        errors: problems.map((message) => ({ message, path: '' })),
      },
      req.t,
    )
  }

  return data
}
