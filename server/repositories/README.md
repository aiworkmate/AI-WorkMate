# Repository Layer

Repositories isolate storage concerns from orchestration and HTTP route logic.

Current priority:

- `conversations/localConversationRepository.mjs` preserves JSON persistence.
- `conversations/supabaseConversationRepository.mjs` provides the first Supabase-backed persistence path for conversations and messages.

Default runtime behavior remains JSON until `WORKMATE_PERSISTENCE_DRIVER=supabase` is set with server-side Supabase credentials and Supabase Auth-compatible UUID scope.
