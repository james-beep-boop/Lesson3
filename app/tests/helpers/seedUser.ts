import { getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { createUserVerified } from './fixtures.js'

export const testUser = {
  name: 'Dev User',
  email: 'dev@payloadcms.com',
  password: 'test',
  roles: ['siteAdmin' as const],
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user (born verified, no verification email — see createUserVerified).
  await createUserVerified(payload, testUser)
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
