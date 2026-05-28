import { config } from '../config.mjs';

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function createSupabaseServiceClient(options = config.supabase) {
  if (!options.url || !options.serviceRoleKey) {
    throw new Error('Supabase service client requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const restUrl = `${options.url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: options.serviceRoleKey,
    authorization: `Bearer ${options.serviceRoleKey}`
  };

  async function request(path, { method = 'GET', query = {}, body, prefer, signal } = {}) {
    const url = new URL(`${restUrl}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      signal,
      headers: {
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(prefer ? { prefer } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    const data = text ? parseJson(text) : null;
    if (!response.ok) {
      const error = new Error(data?.message || data?.hint || `Supabase request failed with ${response.status}.`);
      error.status = response.status;
      error.detail = data;
      throw error;
    }
    return data;
  }

  return {
    request,
    select(table, query = {}) {
      return request(table, { query });
    },
    insert(table, rows, { returning = 'representation' } = {}) {
      return request(table, {
        method: 'POST',
        body: rows,
        prefer: `return=${returning}`
      });
    },
    update(table, values, query = {}, { returning = 'representation' } = {}) {
      return request(table, {
        method: 'PATCH',
        query,
        body: values,
        prefer: `return=${returning}`
      });
    }
  };
}

export function eq(value) {
  return `eq.${value}`;
}

export function order(column, direction = 'asc') {
  return `${column}.${direction}`;
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
