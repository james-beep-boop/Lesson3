// Any setup scripts you might need go here

// Load the integration-test env (DATABASE_URI -> localhost test DB, test secret),
// overriding any values already set by the shell or a loaded .env so tests never
// point at the Docker-internal `postgres` host.
import { config } from 'dotenv'

config({ path: 'test.env', override: true })
