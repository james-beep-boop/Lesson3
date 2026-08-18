import { describe, expect, it } from 'vitest'

import { Users } from '../../src/collections/Users'
import { revealResetLinkEndpoint } from '../../src/endpoints/userAdminActions'
import { userSearchEndpoint } from '../../src/endpoints/userSearch'

/**
 * ⚑ THIS SPEC GUARDS ORDER, not registration. Its first version asserted that `/search` was in
 * `Users.endpoints` with the right path and method — all three of which `tests/http/userSearch.http.spec.ts`
 * proves far more strongly, by actually reaching the route over the wire. What the http spec CANNOT
 * see is the one claim the collection's own comment calls load-bearing: `/search` must be registered
 * BEFORE the dynamic `/:id/…` account actions, because Payload matches custom endpoints in array
 * order and a later `/search` would be swallowed as a user id. Reorder that array and every existing
 * test still passes — until an id-shaped route wins the match.
 */
describe('Manage user-search wiring', () => {
  it('registers GET /search ahead of the dynamic /:id account routes', () => {
    const endpoints = Users.endpoints || []
    const search = endpoints.indexOf(userSearchEndpoint)
    const dynamic = endpoints.indexOf(revealResetLinkEndpoint)

    expect(search, 'GET /search must be registered on Users').toBeGreaterThanOrEqual(0)
    expect(dynamic, 'the account-action routes must be registered on Users').toBeGreaterThan(-1)
    // The route it must outrank is genuinely dynamic — otherwise the ordering below guards nothing.
    expect(revealResetLinkEndpoint.path).toContain(':id')
    expect(search).toBeLessThan(dynamic)
  })
})
