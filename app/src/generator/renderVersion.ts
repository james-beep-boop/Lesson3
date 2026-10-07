/**
 * Cache-busting identity for deterministic derived output.
 *
 * Increment whenever a fixed immutable lesson snapshot would produce different DOCX/PDF/preview
 * bytes because the pinned generator or rendering pipeline changed.
 *
 * 7 (2026-10): re-pinned the ARES generator to upstream 6591146 — attribution block and per-lesson
 * footer in every document, the Final Explanation split into a student document (no exemplars) and a
 * teacher key, Markdown tables rendered as tables, and upstream's null-resource wording. The configured
 * copyright year is FIXED (generator/config/attribution.yaml) so this output does not change in January;
 * changing that year is a deliberate act that must accompany a bump here.
 */
export const GENERATOR_RENDER_VERSION = 7
