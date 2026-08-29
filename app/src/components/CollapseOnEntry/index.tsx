'use client'

/**
 * Collapse the panel this field sits inside, once per document visit.
 *
 * ⚑ WHY THIS EXISTS AT ALL, given `initCollapsed: true` is already on both panels. Payload's
 * `CollapsibleFieldComponent` resolves its opening state as stored preference → `initCollapsed`
 * (verified in `@payloadcms/ui/dist/fields/Collapsible/index.js`: `fetchInitialState` prefers
 * `preferences.fields[path].collapsed` whenever it is defined), and its `onToggle` WRITES that
 * preference on every expand. So a reader who opened Final explanation once on version 42 got it
 * expanded on every later visit to version 42 — while every array row inside it was force-collapsed
 * by {@link ../LessonControls/initialCollapse}. Two disclosures on one screen with opposite memory.
 * This is the same defect that helper exists to fix, one level up.
 *
 * ⚑ AND WHY IT IS A FIELD RATHER THAN A DOM CLICK FROM THE CONTROL BAR. The panel returns `null`
 * until its preference fetch resolves, and a preference fetch is not a form-state change — so a
 * timer in `LessonControls` cannot know whether an absent panel is "not mounted yet" or "already
 * collapsed". Mounting INSIDE the collapsible replaces that guess with a fact: this component exists
 * exactly when the panel does, so `useCollapsible()` reports a settled state on the first run.
 * Fixing a race with a shorter timer is what put the original default in this position.
 *
 * ⚑ IT MARKS THE VISIT DONE WHETHER OR NOT IT COLLAPSED ANYTHING, and that is the whole guard: the
 * rule is "each visit STARTS compact", not "this panel stays compact". Latching on the toggle
 * instead would re-run when `isCollapsed` flipped and snap the panel shut the moment the reader
 * opened it — an entry default that had become a prohibition.
 *
 * Renders nothing. A `ui` field adds no data key, so stored paths, generator input and
 * render-versioning are untouched.
 */
import { useEffect, useRef } from 'react'
import { useCollapsible, useDocumentInfo } from '@payloadcms/ui'

export default function CollapseOnEntry() {
  const { isCollapsed, toggle } = useCollapsible()
  const { id } = useDocumentInfo()
  // The document this component has already applied the entry rule for. A ref, not state: nothing
  // renders from it, and a re-render must not re-arm it.
  const settledFor = useRef<string | null>(null)

  useEffect(() => {
    // `isCollapsed` is `undefined` in the context's default value, i.e. outside a collapsible. Wait
    // for a settled boolean rather than marking the visit done against a state nobody reported.
    if (id == null || typeof isCollapsed !== 'boolean') return

    const documentId = String(id)
    if (settledFor.current === documentId) return
    settledFor.current = documentId

    if (!isCollapsed) toggle()
  }, [id, isCollapsed, toggle])

  return null
}
