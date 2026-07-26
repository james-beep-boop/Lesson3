/**
 * Clear the stored ROW-COLLAPSE state for lesson-plan version editors, so the collapsed-by-default
 * rows (`initCollapsed: true`, 2026-07-25) actually reach people who have used the editor before.
 *
 * SURGICAL: it strips only `value.fields[<path>].collapsed` and writes the document back. Every other
 * stored preference — for those same field paths and for the document as a whole — survives. That is
 * both what "clear the collapse preferences" actually means and what keeps this script safe to keep
 * around: an earlier draft deleted whole preference documents, which was defensible only while the
 * stored state was disposable test data, and that assumption expires without warning.
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
 * `initCollapsed` is never consulted and every unlisted row renders EXPANDED. Without this script the
 * collapse default silently does nothing for exactly the users who asked for it. Removing the
 * `collapsed` key restores the fallback, because both this and the Collapsible field treat an absent
 * value as "no preference".
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
 * Reports by default and writes nothing until APPLY=1 — the target is other people's saved UI state,
 * so look before you leap. Idempotent and safe to re-run: a second run finds nothing left to strip.
 * New preferences accumulate again as soon as anyone toggles a row — that is intended, since collapsed
 * is the INITIAL default and the UI then respects each user's own choice.
 *
 * ⚠ READ-MODIFY-WRITE, so run it while editors are idle and have open tabs reloaded afterwards: a
 * preference saved between the read and the write is lost, and an already-open tab can push its cached
 * collapse values back after the run. Only UI state is at stake — the cost is a wasted run, not data.
 *
 * SCOPE. Payload keys document preferences `collection-${slug}-${id}`
 * (`@payloadcms/ui/dist/providers/DocumentInfo/index.js`), so this matches
 * `collection-lesson-bundle-versions-*` only. LIST-view preferences (saved columns, sort order) use a
 * different key and are NOT touched.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { stripCollapsed } from './lib/stripCollapsed'

const KEY_PREFIX = 'collection-lesson-bundle-versions-'

const run = async () => {
  const payload = await getPayload({ config })
  const apply = process.env.APPLY === '1'

  // `like` maps to a case-insensitive contains; keys are `collection-<slug>-<id>` and no other
  // collection slug contains this one, so the match cannot stray outside the version editor.
  const found = await payload.find({
    collection: 'payload-preferences',
    where: { key: { like: KEY_PREFIX } },
    depth: 0, // don't populate each doc's `user` relationship — that would be an N+1 of user reads
    pagination: false, // every match, not a page — the dry-run report needs the true total
  })

  let touched = 0
  for (const doc of found.docs) {
    const { value, stripped } = stripCollapsed(doc.value)
    if (stripped.length === 0) continue
    touched += 1
    payload.logger.info(`${doc.key} — clearing collapse state for: ${stripped.join(', ')}`)
    if (apply) {
      await payload.update({
        collection: 'payload-preferences',
        id: doc.id,
        data: { value } as never,
      })
    }
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
