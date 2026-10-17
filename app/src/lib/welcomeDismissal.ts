/**
 * The browser-storage key that records "Don't show this again" for the first-login Welcome dialog.
 *
 * Its own import-free module so the dialog and the browser-test sign-in helper share ONE spelling:
 * the tests pre-dismiss the dialog for the pages they exercise, and a key that drifted would leave
 * the modal covering every page again with nothing to say why (2026-10-17: 28 browser tests failed
 * exactly that way after the dialog arrived).
 */
export const welcomeDismissedKey = (userId: number | string): string =>
  `welcome-dismissed-${userId}`
