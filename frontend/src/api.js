import { API_BASE_URL } from './config';

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = sessionStorage.getItem('access_token');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    sessionStorage.removeItem('access_token');
    window.dispatchEvent(new Event('auth:expired'));
  }

  return response;
}
