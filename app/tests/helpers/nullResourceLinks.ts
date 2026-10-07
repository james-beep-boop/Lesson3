/**
 * Stored (Payload-shaped) resourceLinks with EVERY slot null — the "ARES found no suitable resource" case.
 *
 * Real lessons always carry complete stored links (ingest and every save require them) and the renderer now
 * refuses a lesson without them instead of printing blank resources, so any test that runs the real generator
 * over a hand-built lesson needs some. All-null keeps those drift guards on the null-resource path too.
 * DB-free on purpose: unit specs import this, and `fixtures.ts` pulls in Payload.
 */
import { RESOURCE_PHASE_KEYS, aresResourceLinksToRows } from '../../src/ingest/resourceLinks'

export const STORED_NULL_LINKS = aresResourceLinksToRows(
  Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((k) => [
      k,
      { video: null, reading: null, fallback_search_url: 'http://ares.local/search' },
    ]),
  ) as never,
)
