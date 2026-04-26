const PREFIX = 'human_agent_local_profile:';
export const CONTRACTOR_MODES = ['worker'];

export function getLocalProfile(username) {
  if (!username) return null;
  try {
    return JSON.parse(localStorage.getItem(PREFIX + username) || 'null');
  } catch {
    return null;
  }
}

export function setLocalProfile(username, updates) {
  if (!username) return;
  const current = getLocalProfile(username) || {};
  const next = { ...current, ...updates };
  localStorage.setItem(PREFIX + username, JSON.stringify(next));
}

/** Maps minimal `/api/auth/me` payloads to the fields the UI expects, using local storage when the server has no profile fields. */
export function mergeUserResponse(u) {
  if (!u || !u.username) return u;
  const local = getLocalProfile(u.username) || {};
  return {
    ...u,
    account_modes:
      CONTRACTOR_MODES,
    task_topics: u.task_topics && u.task_topics.length ? u.task_topics : local.task_topics || [],
    onboarding_completed:
      u.onboarding_completed != null
        ? u.onboarding_completed
        : local.onboarding_completed != null
          ? local.onboarding_completed
          : false,
    is_admin: Boolean(u.is_admin),
  };
}
