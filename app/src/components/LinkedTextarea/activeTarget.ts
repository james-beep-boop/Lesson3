'use client'

/**
 * Tiny client-side bridge between Payload's sibling field components and LessonControls.
 *
 * A link target exists only after the user places the cursor in a linkable textarea. The toolbar
 * reads the boolean snapshot to enable its one Insert link button, then asks the currently active
 * field to open its own dialog. Keeping the dialog with the field means its Payload `setValue`,
 * cursor restoration and access state remain local rather than being duplicated in the toolbar.
 */
type ActiveLinkTarget = {
  id: symbol
  openDialog: () => void
}

let activeTarget: ActiveLinkTarget | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

export const activateLinkTarget = (target: ActiveLinkTarget): void => {
  activeTarget = target
  notify()
}

/** With an id, clear only the field that registered itself; without one, clear the edit session. */
export const clearActiveLinkTarget = (id?: symbol): void => {
  if (!activeTarget || (id && activeTarget.id !== id)) return
  activeTarget = null
  notify()
}

export const openActiveLinkTarget = (): void => {
  activeTarget?.openDialog()
}

export const hasActiveLinkTarget = (): boolean => activeTarget !== null

export const subscribeToActiveLinkTarget = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
