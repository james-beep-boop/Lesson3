/**
 * The `system-settings` flag vocabulary — names only, DEPENDENCY-FREE on purpose.
 *
 * ⚑ WHY ITS OWN MODULE. The global config (`globals/SystemSettings.ts`) mounts the Save endpoint, the
 * endpoint needs to know which flags are saveable, and the reader and the future System panel (a CLIENT
 * component) need the names too. With the vocabulary inside the global, the endpoint could only import it
 * back through a cycle, and the panel would have pulled Payload into the browser bundle to learn a list
 * of strings. Here, everything imports names from a module that imports nothing.
 */

/** Every stored flag. Must match the global's `features` fields — `systemSettingsFlags.spec.ts` pins it. */
export const SYSTEM_FLAGS = ['publicLibraryLive', 'forumEnabled'] as const
export type SystemFlag = (typeof SYSTEM_FLAGS)[number]

/**
 * The flags the Save endpoint may change — a SUBSET of {@link SYSTEM_FLAGS}, deliberately.
 *
 * ⚑ `publicLibraryLive` IS NOT HERE. Nothing enforces it yet (`lib/publicLibrary.ts` reads only the env
 * ceiling), so a writable switch would change a value no reader consults — the "never render a toggle
 * for something absent" rule, applied to the API as well as the panel. It joins this list in the PR
 * that gives it an enforcement point, together with the acknowledgement its "goes public" warning needs.
 */
export const SAVEABLE_FLAGS = ['forumEnabled'] as const satisfies readonly SystemFlag[]
export type SaveableFlag = (typeof SAVEABLE_FLAGS)[number]
