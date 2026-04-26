const DEFAULT_API_BASE_URL = 'https://lahacksbackend-production.up.railway.app';
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

export { API_BASE_URL };
