# Permissions

Permission helpers live here.

`scope.mjs` validates Supabase Auth-compatible UUID scope before optional Supabase persistence is used. This prevents local `usr_...` development accounts from being written into tables that correctly reference `auth.users(id)`.
