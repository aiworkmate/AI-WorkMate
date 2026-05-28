# Database

Database utilities live here.

`supabaseClient.mjs` is a minimal server-side REST client that uses the service role key only on the backend. It is intentionally dependency-free so the current app can keep running before a package-lock-based Supabase SDK migration.
