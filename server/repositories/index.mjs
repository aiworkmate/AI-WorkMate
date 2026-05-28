import { config } from '../config.mjs';
import { isSupabaseConfigured } from '../db/supabaseClient.mjs';
import { createLocalConversationRepository } from './conversations/localConversationRepository.mjs';
import { createSupabaseConversationRepository } from './conversations/supabaseConversationRepository.mjs';

export function createRepositories(store) {
  const local = {
    conversations: createLocalConversationRepository(store),
    driver: 'json'
  };

  if (config.persistence.driver !== 'supabase') return local;

  if (!isSupabaseConfigured()) {
    console.warn('WORKMATE_PERSISTENCE_DRIVER=supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Falling back to JSON persistence.');
    return local;
  }

  return {
    ...local,
    conversations: createSupabaseConversationRepository(),
    driver: 'supabase'
  };
}

export function getRepositories(store) {
  if (!store.repositories) store.repositories = createRepositories(store);
  return store.repositories;
}
