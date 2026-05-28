import { nowISO, sanitizeText, uid } from '../../lib/utils.mjs';

export function createLocalConversationRepository(store) {
  return {
    async saveTurn({ user, conversationId, text, answer, mode, uploadIds = [], toolNames = [] }) {
      let conversation = null;
      await store.update((db) => {
        conversation = db.conversations.find((item) => item.id === conversationId && item.userId === user.id);
        if (!conversation) {
          conversation = {
            id: uid('conv'),
            userId: user.id,
            title: titleFrom(text),
            mode,
            createdAt: nowISO(),
            updatedAt: nowISO()
          };
          db.conversations.push(conversation);
        }
        conversation.updatedAt = nowISO();
        conversation.mode = mode;
        db.messages.push({
          id: uid('msg'),
          conversationId: conversation.id,
          userId: user.id,
          role: 'user',
          content: text,
          uploadIds,
          toolNames: [],
          createdAt: nowISO()
        });
        db.messages.push({
          id: uid('msg'),
          conversationId: conversation.id,
          userId: user.id,
          role: 'assistant',
          content: answer,
          uploadIds: [],
          toolNames,
          createdAt: nowISO()
        });
      });
      return conversation;
    },

    async listForUser(userId) {
      const db = store.snapshot();
      return db.conversations
        .filter((item) => item.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((item) => ({ ...item, messageCount: db.messages.filter((msg) => msg.conversationId === item.id).length }));
    },

    async getForUser(userId, id) {
      const db = store.snapshot();
      const conversation = db.conversations.find((item) => item.id === id && item.userId === userId);
      if (!conversation) return null;
      return {
        conversation,
        messages: db.messages.filter((item) => item.conversationId === id)
      };
    }
  };
}

function titleFrom(text) {
  const clean = sanitizeText(text, 80);
  return clean.length > 58 ? `${clean.slice(0, 58)}...` : clean || 'New conversation';
}
