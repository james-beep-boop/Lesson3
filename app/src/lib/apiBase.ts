/**
 * REST API base URL from the admin client config (`useConfig().config`) — one home for the
 * `serverURL + routes.api` join the Manage client components all need. Structurally typed so it
 * takes the client OR server config shape without importing Payload types into client bundles.
 */
export const apiBaseFrom = (config: {
  serverURL?: string
  routes?: { api?: string }
}): string => `${config.serverURL || ''}${config.routes?.api || '/api'}`
