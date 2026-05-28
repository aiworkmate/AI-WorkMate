# AI WorkMate Supabase Migration Plan

This phase is design and scaffold only. It does not remove the current local JSON runtime, does not rewrite the frontend, and does not apply remote destructive database changes.

## Current Backend Architecture

AI WorkMate currently runs as a zero-dependency Node HTTP app.

| Area | Current implementation | Supabase target |
| --- | --- | --- |
| Auth | Local `users` and `sessions` in `data/workmate.db.json`; PBKDF2 password hashing; HTTP-only cookies; CSRF checks | Supabase Auth plus `profiles`, organization membership, workspace membership, and server-only service role operations |
| Persistence | `JsonStore` snapshots and serialized writes in `server/lib/storage.mjs` | Postgres tables with RLS and explicit tenant/workspace ownership |
| Chat | `/api/chat`, `/api/chat/stream`, `orchestrateChat()` | `conversations`, `messages`, `message_citations`; Edge Function or backend API preserving final-response flow |
| Memory | Local semantic hash vectors in `server/modules/memory.mjs` | `memories.embedding vector(1536)` plus `match_memories()` RPC using pgvector |
| Uploads | Metadata in JSON store; files handled by upload module | Private Supabase Storage buckets plus `uploads` metadata and optional embeddings |
| Tools | `planTools()` and `runToolPlan()` choose weather, search, news, PubMed, calculator | Tool invocations remain server-side and are persisted in `tool_invocations` for auditability |
| Analytics | JSON `analytics` records through `recordMetric()` | `analytics` table scoped by organization/workspace/user |
| Audit | JSON `auditLogs` records through `audit()` | `audit_logs` table with admin-only read policies |
| Medical mode | Guardrails in `medical.mjs` and mode-aware orchestration | Same runtime behavior, with future medical metadata captured through conversations, messages, uploads, and workflow tables |

## Request Data Flow To Preserve

The existing AI pipeline must remain behaviorally intact:

```text
User request
-> auth/session + CSRF + rate limit
-> internal router decision
-> memory retrieval
-> upload/document context
-> tool planning + tool execution
-> generateFinalResponse()
-> final assistant response only
-> conversation/messages + analytics + audit persistence
```

The router is decision-only. Frontend responses must continue to render only the final assistant answer, never route state, next-action text, or orchestration debug output.

## Local JSON Persistence Points

The current `JsonStore` collections map as follows:

| JSON collection | Supabase table |
| --- | --- |
| `users` | Supabase Auth `auth.users` plus `public.profiles` |
| `sessions` | Supabase Auth sessions |
| `conversations` | `public.conversations` |
| `messages` | `public.messages` and `public.message_citations` |
| `memories` | `public.memories` |
| `uploads` | `public.uploads` plus private Storage objects |
| `auditLogs` | `public.audit_logs` |
| `analytics` | `public.analytics` |

## Migration Files

Apply migrations in order only after review:

1. `202605280001_ai_workmate_core.sql`
   - Enables `vector`, `pgcrypto`, and `uuid-ossp`.
   - Creates enums, organization/workspace tables, chat tables, memory/upload tables, workflow tables, audit logs, analytics, indexes, triggers, and `match_memories()`.

2. `202605280002_ai_workmate_rls_storage.sql`
   - Enables RLS on all application tables.
   - Creates organization, workspace, user, admin, analytics, and audit policies.
   - Creates private Storage buckets: `uploads`, `documents`, `avatars`, `workflow-assets`, `temporary-files`.
   - Adds Storage object policies for workspace paths and avatar ownership.

3. `202605280003_ai_workmate_least_privilege_grants.sql`
   - Replaces broad private-schema function execution with explicit grants for RLS helper functions only.
   - Keeps trigger/bootstrap helpers ungranted to frontend-facing roles.

## Repository Layer Scaffold

The Node backend now has the first persistence seam for the migration:

```text
server/db/supabaseClient.mjs
server/repositories/index.mjs
server/repositories/conversations/localConversationRepository.mjs
server/repositories/conversations/supabaseConversationRepository.mjs
server/permissions/scope.mjs
```

Runtime defaults to local JSON storage. Set `WORKMATE_PERSISTENCE_DRIVER=supabase` only after Supabase Auth, organization ids, workspace ids, and RLS have been validated. The Supabase conversation repository requires UUID user, organization, and workspace scope so local `usr_...` development users are not written into tables that reference `auth.users(id)`.

## Target Schema Decisions

### Identity And Tenancy

- `profiles` mirrors `auth.users` and stores display/account settings, not passwords.
- `organizations` represent enterprise tenants.
- `organization_members` assigns tenant roles: `owner`, `admin`, `member`, `viewer`.
- `workspaces` are the primary collaboration and data boundary inside an organization.
- `workspace_members` assigns workspace roles: `owner`, `admin`, `editor`, `viewer`.

### Chat And AI Output

- `conversations` owns chat thread metadata and mode (`general`, `medical`, `workflow`, `admin`).
- `messages` stores user, assistant, system, and tool messages while preserving final-response output.
- `message_citations` stores grounded references from tools, web, uploads, or future medical sources.
- Conversations are the first repository-backed migration target. The orchestrator now calls the conversation repository after `generateFinalResponse()` succeeds, preserving the final-response pipeline.

### Memory

- `memories` stores long-term semantic memory with:
  - `user_id` for personal memory ownership.
  - optional `workspace_id` for team/workflow memory.
  - `embedding vector(1536)` for semantic retrieval.
  - `importance`, `tags`, `metadata`, and `archived` for ranking and retention.
- `match_memories()` uses pgvector cosine distance and remains `security invoker` so RLS still applies.

### Uploads And Documents

- Storage object bytes live in private Supabase Storage buckets.
- `uploads` stores metadata, extraction status, extracted text, summaries, and optional embeddings.
- Storage paths should use:

```text
{organization_id}/{workspace_id}/{user_id}/{upload_id}/{filename}
avatars/{user_id}/{filename}
```

Current storage RLS expects workspace buckets to include organization, workspace, and user identifiers in the path.

### Workflows

- `workflows` stores versioned workflow definitions and trigger config.
- `workflow_runs` stores execution state, latency, input/output, and error details.
- `tool_invocations` stores tool calls linked to messages or workflow runs.

### Audit And Analytics

- `audit_logs` records security, auth, upload, memory, admin, and workflow events.
- `analytics` records product and AI metrics such as latency, model usage, token estimates, tools, modes, and errors.

## RLS Strategy

RLS is enabled on every application table.

Core rules:

- Users can read/update their own profile.
- Users can see profiles only for users who share an organization with them.
- Organization members can read their organization.
- Organization owners/admins can manage organization and workspace membership.
- Workspace readers can read workspace conversations, messages, uploads, workflows, and runs.
- Workspace editors/admins/owners can create operational records.
- Memory is readable by the owner or by workspace readers when memory is workspace-scoped.
- Audit and analytics read access is admin-only at platform, organization, or workspace level.
- Insert policies require ownership checks with `auth.uid()`.
- Update policies include both `USING` and `WITH CHECK`.

Authorization data must come from relational membership tables or trusted server-side app metadata, not user-editable metadata.

## Storage Security

Buckets are private by default:

| Bucket | Purpose | Public |
| --- | --- | --- |
| `uploads` | General user uploads | No |
| `documents` | Parsed documents and source files | No |
| `avatars` | User avatars | No |
| `workflow-assets` | Workflow-related files | No |
| `temporary-files` | Short-lived processing files | No |

Storage RLS validates workspace paths using the workspace id and user id embedded in the object name. Avatar policies restrict writes to the authenticated user's own path.

## AI Orchestration Migration Boundary

Do not rewrite the orchestrator in this phase.

The migration layer should prepare persistence for:

- memory retrieval before answer generation
- upload/document context
- workflow context
- tool routing and results
- citations
- streaming response persistence
- audit logging
- analytics metrics

The production flow remains:

```text
Router -> Memory -> Tools -> LLM -> FINAL RESPONSE -> UI
```

## Environment Mapping

Frontend-safe:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Server-only:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, search provider keys, or medical integration secrets to frontend code.

## Validation Checklist

Before applying remotely:

- Review generated SQL for destructive operations.
- Confirm every public application table has RLS enabled.
- Confirm Storage buckets are private.
- Confirm service-role secrets are backend-only.
- Confirm pgvector indexes exist for memory/upload retrieval.
- Confirm `match_memories()` remains `security invoker`.
- Run Supabase security and performance advisors after applying to a development branch.
- Generate TypeScript types from the applied database schema.

## Non-Goals For This Phase

- No frontend rewrite.
- No removal of local JSON runtime.
- No production data migration.
- No destructive schema changes.
- No automatic medical diagnosis workflows.
- No direct exposure of AI provider calls from the browser.
