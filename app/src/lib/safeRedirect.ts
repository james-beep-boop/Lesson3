/**
 * Guard for post-login redirect targets. Only internal absolute paths are allowed — protocol-
 * relative (`//evil.com`) and absolute external URLs (`https://…`) are rejected, so a crafted
 * `?redirect=` can't bounce a freshly-authenticated user off-site (open-redirect). Shared by the
 * middleware that forwards Payload's `/admin/login?redirect=…` and the `/login` page that honours it.
 */
export const isSafeRedirect = (path: unknown): path is string =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
