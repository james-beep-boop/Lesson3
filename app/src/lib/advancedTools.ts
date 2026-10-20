/**
 * Standard / Advanced tools (2026-10-20; `docs/DESIGN-modes-connectivity-network-2026-10-19.md` §2).
 *
 * ONE list says which actions are advanced; ONE resolver says which mode applies. Screens receive the
 * resolved mode and ask {@link showsAction} — nothing else decides, so the later subject-grade and
 * per-person overrides change only {@link resolveMode}.
 *
 * ⚑ DISPLAY ONLY, NEVER AUTHORIZATION. Standard hides an action; it does not forbid it. Every action
 * keeps its existing permission, SMTP and API checks, and Advanced never reveals one the person could
 * not already use — callers combine `showsAction` with those checks, never replace them.
 *
 * ⚑ STARTING, NOT CONTINUING. Combine is advanced: Standard hides the ways to START one. An unfinished
 * Combine — its conflict panel, choices, Retry, Save and Discard — keeps working in any mode, so a
 * switch to Standard can never strand someone's work.
 */
import type { SystemFlags } from './systemFlags'

export type InterfaceMode = 'standard' | 'advanced'

/** The advanced actions (operator decision 2026-10-20). Insert link is deliberately everyday. */
export const ADVANCED_ACTIONS = [
  'combineVersions', // the editor's More ▾: starting a Combine, and the "Combine with…" shortcuts
  'showDetails', // the editor's More ▾
  'downloadJson', // the lesson page's Share menu
  'emailDocuments', // the lesson page's Share menu (still also needs email to be set up)
] as const
export type AdvancedAction = (typeof ADVANCED_ACTIONS)[number]

/** The one place the mode is decided. Site-wide only for now. */
export const resolveMode = (
  flags: Pick<SystemFlags, 'advancedTools'> | undefined,
): InterfaceMode => (flags?.advancedTools === true ? 'advanced' : 'standard')

/** Whether `action` may be shown in `mode` — before the action's own permission checks. */
export const showsAction = (mode: InterfaceMode, action: AdvancedAction): boolean =>
  mode === 'advanced' || !(ADVANCED_ACTIONS as readonly string[]).includes(action)
