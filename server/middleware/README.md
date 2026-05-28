# Middleware

Middleware modules will hold reusable request concerns such as authentication checks, rate limiting, CSRF validation, request IDs, logging, and security headers.

The current implementation still lives in `server/lib/security.mjs` and `server/app.mjs`; move pieces here only when the migration needs them.
