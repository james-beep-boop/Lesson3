/**
 * Clear the stored ROW-COLLAPSE state for lesson-plan version editors, so the collapsed-by-default
 * rows (`initCollapsed: true`, 2026-07-25) actually reach people who have used the editor before.
 *
 * SURGICAL: it strips only `value.fields[<path>].collapsed` and writes the document back. Every other
 * stored preference — for those same field paths and for the document as a whole — survives.
 *
 * WHY THIS EXISTS. `initCollapsed` is only the LAST of three fallbacks. Verified in
 * `@payloadcms/ui/dist/forms/fieldSchemasToFormState/isRowCollapsed.js`:
 *
 *     if (previousRow && 'collapsed' in previousRow) return previousRow.collapsed ?? false
 *     if (collapsedPrefs !== undefined) return collapsedPrefs.includes(row.id)
 *     return field.admin.initCollapsed
 *
 * The middle tier is gated on `collapsedPrefs !== undefined` and then decided by row-id membership. So
 * once a preferences entry exists for an array path — for ANY reason, even one listing unrelated rows —
 * `initCollapsed` is never consulted and every unlisted row renders EXPANDED. Removing the `collapsed`
 * key restores the fallback, because an absent value reads as "no preference".
 *
 * DEV/OPERATOR tool. Needs a DB. Locally:
 *   cd app && npx payload run scripts/clear-editor-collapse-prefs.ts            # report only
 *   cd app && APPLY=1 npx payload run scripts/clear-editor-collapse-prefs.ts    # actually write
 *
 * ON THE ROCK, run it from the `migrate` service, NOT `app` — the prod `app` image is a minimal Next
 * standalone with no Payload CLI and no `scripts/` source, while `migrate` is built from the
 * Dockerfile's `builder` stage. And `APPLY=1` must go INSIDE the container via `-e`; a shell prefix
 * would only set it for the local docker CLI. Full runbook: `docs/OPS.md` → Deploy.
 *   docker compose run --rm [-e APPLY=1] migrate npx payload run scripts/clear-editor-collapse-prefs.ts
 *
 * Reports by default and writes nothing until APPLY=1 — the target is other people's saved UI state, so
 * look before you leap. Idempotent: a second run finds nothing left to strip. New preferences accumulate
 * again as soon as anyone toggles a row — intended, since collapsed is only the INITIAL default.
 *
 * ⚠ READ-MODIFY-WRITE, so run it while editors are idle and have open tabs reloaded afterwards: a
 * preference saved between the read and the write is lost, and an already-open tab can push its cached
 * collapse values back after the run. Only UI state is at stake — the cost is a wasted run, not data.
 *
 * SCOPE: `PREFERENCE_KEY_PREFIX` only, so version-editor documents. LIST-view preferences (saved
 * columns, sort order) use a different key and are NOT touched.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { PREFERENCE_KEY_PREFIX, writePreferenceValue } from './lib/preferences'
import { stripCollapsed } from './lib/stripCollapsed'

const run = async () => {
  const payload = await getPayload({ config })
  const apply = process.env.APPLY === '1'

  // `like` maps to a case-insensitive contains; keys are `collection-<slug>-<id>` and no other
  // collection slug contains this one, so the match cannot stray outside the version editor.
  const found = await payload.find({
    collection: 'payload-preferences',
    where: { key: { like: PREFERENCE_KEY_PREFIX } },
    // Leaves `user` as the unpopulated `{ relationTo, value }` that `writePreferenceValue` needs, and
    // avoids an N+1 of user reads: `user` is polymorphic, so it is never join-populated — at any depth
    // above 0 it would be fetched per document during afterRead.
    depth: 0,
    pagination: false, // every match, not a page — the dry-run report needs the true total
  })

  let touched = 0
  for (const doc of found.docs) {
    const { value, stripped } = stripCollapsed(doc.value)
    if (stripped.length === 0) continue
    touched += 1
    payload.logger.info(`${doc.key} — clearing collapse state for: ${stripped.join(', ')}`)
    if (apply) await writePreferenceValue(payload, doc, value)
  }

  if (touched === 0) {
    payload.logger.info(
      `Scanned ${found.docs.length} preference document(s); none carry collapse state. Nothing to do.`,
    )
    return
  }
  payload.logger.info(
    apply
      ? `Cleared collapse state on ${touched} of ${found.docs.length} preference document(s).`
      : `DRY RUN — ${touched} of ${found.docs.length} preference document(s) would be updated. Re-run with APPLY=1.`,
  )
}

await run()
