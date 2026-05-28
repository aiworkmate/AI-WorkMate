import { createSupabaseServiceClient, eq, order } from '../../db/supabaseClient.mjs';
import { resolveWorkspaceScope } from '../../permissions/scope.mjs';

export function createSupabaseConversationRepository({ client = createSupabaseServiceClient(), scopeResolver = resolveWorkspaceScope } = {}) {
  return {
    async saveTurn({ user, conversationId, text, answer, mode, uploadIds = [], toolNames = [] }) {
      const scope = requireScope(scopeResolver(user));
      let conversation = conversationId ? await findConversation(client, conversationId, scope.userId) : null;

      if (!conversation) {
        [conversation] = await client.insert('conversations', [{
          organization_id: scope.organizationId,
          workspace_id: scope.workspaceId,
          user_id: scope.userId,
          title: titleFrom(text),
          mode: normalizeMode(mode),
          metadata: {}
        }]);
      } else {
        [conversation] = await client.update('conversations', {
          mode: normalizeMode(mode),
          updated_at: new Date().toISOString()
        }, {
          id: eq(conversation.id),
          user_id: eq(scope.userId)
        });
      }

      await client.insert('messages', [
        {
          organization_id: scope.organizationId,
          workspace_id: scope.workspaceId,
          conversation_id: conversation.id,
          user_id: scope.userId,
          role: 'user',
          content: text,
          upload_ids: normalizeUuidArray(uploadIds),
          tool_names: [],
          token_estimate: estimateTokens(text),
          is_final_response: false,
          metadata: {}
        },
        {
          organization_id: scope.organizationId,
          workspace_id: scope.workspaceId,
          conversation_id: conversation.id,
          user_id: scope.userId,
          role: 'assistant',
          content: answer,
          upload_ids: [],
          tool_names: toolNames,
          token_estimate: estimateTokens(answer),
          is_final_response: true,
          metadata: {}
        }
      ]);

      return fromSupabaseConversation(conversation);
    },

    async listForUser(userId) {
      const conversations = await client.select('conversations', {
        select: 'id,user_id,title,mode,created_at,updated_at',
        user_id: eq(userId),
        order: order('updated_at', 'desc')
      });
      return conversations.map(fromSupabaseConversation);
    },

    async getForUser(userId, id) {
      const conversation = await findConversation(client, id, userId);
      if (!conversation) return null;
      const messages = await client.select('messages', {
        select: 'id,conversation_id,user_id,role,content,upload_ids,tool_names,created_at,is_final_response',
        conversation_id: eq(id),
        order: order('created_at', 'asc')
      });
      return {
        conversation: fromSupabaseConversation(conversation),
        messages: messages.map(fromSupabaseMessage)
      };
    }
  };
}

async function findConversation(client, id, userId) {
  const rows = await client.select('conversations', {
    select: 'id,user_id,title,mode,created_at,updated_at',
    id: eq(id),
    user_id: eq(userId),
    limit: 1
  });
  return rows[0] || null;
}

function requireScope(scope) {
  if (!scope.ok) {
    const error = new Error(scope.reason);
    error.status = 503;
    throw error;
  }
  return scope;
}

function fromSupabaseConversation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fromSupabaseMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    uploadIds: row.upload_ids || [],
    toolNames: row.tool_names || [],
    isFinalResponse: row.is_final_response,
    createdAt: row.created_at
  };
}

function normalizeMode(mode) {
  return ['general', 'medical', 'workflow', 'admin'].includes(mode) ? mode : 'general';
}

function normalizeUuidArray(values) {
  return Array.isArray(values) ? values.filter((value) => /^[0-9a-f-]{36}$/i.test(String(value))) : [];
}

function estimateTokens(value) {
  return Math.ceil(String(value || '').length / 4);
}

function titleFrom(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean.length > 58 ? `${clean.slice(0, 58)}...` : clean || 'New conversation';
}
