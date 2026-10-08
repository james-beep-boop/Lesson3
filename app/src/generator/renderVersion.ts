/**
 * Cache-busting identity for deterministic derived output.
 *
 * Increment whenever a fixed immutable lesson snapshot would produce different DOCX/PDF/preview
 * bytes because the pinned generator or rendering pipeline changed.
 *
 * 9 (2026-10): re-pinned to upstream f83db61 — a Markdown table in a lesson-framework column now prints
 * full-width in its own row under the phase (a "(table below)" pointer stays in the cell) instead of nested in
 * the narrow column, and a lone `|x| = 3` line is no longer mistaken for a table. Lesson-plan DOCX/PDF/preview
 * bytes differ for any plan with a framework table (and the shared kit changed), so every cached artifact must
 * regenerate.
 *
 * 8 (2026-10): re-pinned to upstream b3743ff — Markdown tables now render in the Final Explanation
 * `instructions` and in the lesson overview / framework prose cells, section headers and student prompts carry
 * keep-with-next (every paragraph now also carries an explicit `keepNext` property), and `richCell` moved into the
 * shared kit. Every generated DOCX/PDF/preview differs, so every cached artifact must regenerate.
 *
 * 7 (2026-10): re-pinned the ARES generator to upstream 6591146 — attribution block and per-lesson
 * footer in every document, the Final Explanation split into a student document (no exemplars) and a
 * teacher key, Markdown tables rendered as tables, and upstream's null-resource wording. The configured
 * copyright year is FIXED (generator/config/attribution.yaml) so this output does not change in January;
 * changing that year is a deliberate act that must accompany a bump here.
 */
export const GENERATOR_RENDER_VERSION = 9
