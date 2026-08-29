/**
 * The editor's ENTRY PHASE: the window, per document, in which "each visit starts compact" applies.
 *
 * ⚑ WHY A PHASE AND NOT A PER-COMPONENT LATCH. `CollapseOnEntry` originally decided on its own, using
 * a ref, and that was wrong in exactly one situation — which a browser found and no unit test could.
 * The two trailing panels are groups whose contents come from a nested `RenderIfInViewport`, so on a
 * tall document the panel's children have never mounted. A jump chip then opens the panel, its
 * children mount for the FIRST time, and the entry rule's first run sees an expanded panel and shuts
 * it. Measured on a 13-lesson plan: panel mounts at 104ms, the jump's retry opens it at 206ms, the
 * entry rule closes it again at 334ms. Both halves behaved exactly as designed; together they
 * cancelled out.
 *
 * A latch cannot fix that, because the component's first run IS the moment the damage is done. The
 * question was never "have I run before" but "is this still the document's entry" — and that is a
 * property of the DOCUMENT, so it lives here rather than inside any one panel.
 *
 * ⚑ AND IT IS NOT A "did a jump happen" FLAG, though a jump is the only thing that ends it today.
 * Naming it for its cause would invite the next reveal path — edit-recovery restore, a future deep
 * link to a panel — to reintroduce the same collision by simply not knowing to call it. Whatever
 * deliberately reveals content ends the entry phase; that is one rule for a class, not a patch for
 * one caller.
 *
 * ⚑ MOUNT-DRIVEN COVERAGE IS DELIBERATELY KEPT. The alternative considered was a registry: panels
 * register with `LessonControls`, which collapses them in the same once-per-document pass it already
 * runs for array rows. It was rejected because rows and panels are not symmetric. A row's collapse
 * state lives in FORM STATE, which is complete at entry whether or not the row was ever painted — so
 * one dispatch reaches every row. A collapsible has no form-state representation at all; its state
 * lives in a component that exists only once mounted. A registry can therefore only ever hold the
 * panels that happen to be mounted at entry, and Summary table was measured still unmounted SIX
 * SECONDS after load on a tall document. That design would have silently narrowed the rule to
 * whatever sits above the fold — the same class of silent gap this whole change exists to close.
 */

/**
 * The document whose entry phase has been ENDED, if any.
 *
 * ⚑ OPEN IS THE DEFAULT, and that is a correctness requirement rather than a convenience. The first
 * version enabled the phase from an effect in `LessonControls`, and a browser caught it immediately:
 * React flushes a child's effects before its parent's, so `CollapseOnEntry` inside a panel that is
 * already mounted at load ran BEFORE the phase was opened, saw it shut, and skipped — leaving Final
 * explanation expanded on return while Summary table, which mounts later on scroll, collapsed
 * correctly. Storing "who has ended it" instead of "who has begun it" removes the ordering question
 * entirely: nothing has to run first for the rule to hold.
 */
let closedFor: string | null = null

/**
 * End this document's entry phase: something has deliberately revealed content, so nothing further is
 * auto-collapsed for the rest of the visit.
 */
export function endEntryPhase(documentId: string): void {
  closedFor = documentId
}

/**
 * Start a fresh visit to `documentId`. Only meaningful after a reveal ended the previous one —
 * re-entering a document later in the session is a new visit, and the rule is about visits.
 */
export function beginEntryPhase(documentId: string): void {
  if (closedFor === documentId) closedFor = null
}

/** Is `documentId` still in its entry phase? True unless a reveal ended it for that document. */
export function isEntryPhaseOpen(documentId: string): boolean {
  return closedFor !== documentId
}
