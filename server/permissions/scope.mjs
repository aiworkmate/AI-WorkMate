import { config } from '../config.mjs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return uuidPattern.test(String(value || ''));
}

export function resolveWorkspaceScope(user, input = {}) {
  const organizationId = input.organizationId || user.organizationId || user.organization_id || config.supabase.defaultOrganizationId;
  const workspaceId = input.workspaceId || user.workspaceId || user.workspace_id || config.supabase.defaultWorkspaceId;

  if (!isUuid(user.id) || !isUuid(organizationId) || !isUuid(workspaceId)) {
    return {
      ok: false,
      reason: 'Supabase persistence requires Supabase Auth UUID user, organization, and workspace ids.'
    };
  }

  return {
    ok: true,
    userId: user.id,
    organizationId,
    workspaceId
  };
}
