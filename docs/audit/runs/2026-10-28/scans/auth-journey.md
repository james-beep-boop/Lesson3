# Native authentication journey — C23 supplement

The dedicated audit app temporarily enabled capture-only SMTP and a configured HTTP SERVER_URL/CSRF origin. An exclusive target lock covered recreation, testing and restoration to the previous no-email mode. Only synthetic accounts and the local catcher were used.

All16 assertions passed: signup cannot self-verify/grant administration; unverified login denied; captured verification link works once; two concurrent native sessions; expected HttpOnly/SameSite=Lax HTTP cookie flags; foreign-origin cookie PATCH403 with both name and timestamp unchanged; trusted-origin PATCH200 with stored positive control; logout invalidates its session while the other remains valid; known/unknown forgot-password pair has identical status/body; reset-page Referrer-Policy header; captured reset link changes password; old sessions and old password fail; replacement password works; consumed reset token is refused.

This is native HTTP/mail integration evidence, not a browser completion claim. The referrer assertion checks the response header declaring strict-origin-when-cross-origin; it did not navigate a real foreign site. The one forgot-password pair is not a statistical timing test. Secure-cookie enforcement on HTTPS, actual two-hour browser expiry, expired unused reset tokens and deployment/proxy parity remain separate checks. Existing wire login-protection tests passed in the baseline; their fixtures are not live health checks.

Detailed sanitized assertions: `auth-journey.json`. Tokens, cookies, messages and raw target configuration remain private. Fixtures were removed and the app mode restored.
