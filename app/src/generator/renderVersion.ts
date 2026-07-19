/**
 * Cache-busting identity for deterministic derived output.
 *
 * Increment whenever a fixed immutable lesson snapshot would produce different DOCX/PDF/preview
 * bytes because the pinned generator or rendering pipeline changed.
 */
export const GENERATOR_RENDER_VERSION = 2
