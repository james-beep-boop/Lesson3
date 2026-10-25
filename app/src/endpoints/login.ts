import { APIError, headersWithCors, loginOperation, type Endpoint } from 'payload'
import { generatePayloadCookie } from 'payload/shared'
import { assertDeclaredBodyWithin, readJsonBody, json } from './respond'
import { withLoginCapacity } from '../lib/loginProtection'

/** Shadows only the HTTP handler; Payload still verifies passwords, sessions, fields and cookies. */
export const protectedLoginEndpoint: Endpoint = {
  path: '/login',
  method: 'post',
  handler: async (req) => {
    assertDeclaredBodyWithin(req, 16 * 1024, 'Request body too large')
    let body: { email?: unknown; password?: unknown } | null = null
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      // Payload's native admin form sends JSON in a multipart `_payload` field.
      // Parse that field without invoking upload handling on a password-only endpoint.
      try {
        const encoded = (await req.formData?.())?.get('_payload')
        if (typeof encoded === 'string') body = JSON.parse(encoded)
      } catch {
        throw new APIError('Enter your email and password.', 400)
      }
    } else {
      body = await readJsonBody(req, 16 * 1024)
    }
    if (
      typeof body?.email !== 'string' ||
      typeof body.password !== 'string' ||
      !body.email.trim() ||
      !body.password.trim()
    ) {
      throw new APIError('Enter your email and password.', 400)
    }
    const collection = req.payload.collections.users
    return withLoginCapacity(req, body.email, async () => {
      const rawDepth = req.searchParams.get('depth')
      const result = await loginOperation({
        collection,
        data: { email: body.email as string, password: body.password as string },
        req,
        depth: rawDepth && /^\d+$/.test(rawDepth) ? Math.min(Number(rawDepth), 10) : undefined,
      })
      if (!result.token) throw new Error('Payload login returned no session token')
      const cookie = generatePayloadCookie({
        collectionAuthConfig: collection.config.auth,
        cookiePrefix: req.payload.config.cookiePrefix ?? 'payload',
        token: result.token,
      })
      if (collection.config.auth.removeTokenFromResponses) delete result.token
      return json(
        { message: req.t('authentication:passed'), ...result },
        200,
        Object.fromEntries(
          headersWithCors({
            headers: new Headers({ 'Set-Cookie': cookie, 'Cache-Control': 'no-store' }),
            req,
          }),
        ),
      )
    })
  },
}
