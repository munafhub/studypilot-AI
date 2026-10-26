const TOKEN_KEY = 'studypilot_token';

/**
 * Where the API lives. Set VITE_API_URL (e.g. https://studypilot-ai.bonto.run) when the
 * frontend is deployed separately from the backend. Leave it empty for same-origin "/api/...".
 */
const rawBase = import.meta.env?.VITE_API_URL || '';
export const API_BASE = rawBase.replace(/\/+$/, '');

function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

/** The student's local calendar date (YYYY-MM-DD), sent so "today" matches their timezone. */
export function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields;
  }
}

async function request(method, path, { body, raw, contentType } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    headers['Content-Type'] = contentType;
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(resolveUrl(path), { method, headers, body: payload });
  } catch {
    throw new ApiError(0, { error: { message: `Cannot reach the server at ${API_BASE || '(same origin)'}. Is it running?` } });
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('studypilot:logout'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, { body: body ?? {} }),
  put: (url, body) => request('PUT', url, { body }),
  patch: (url, body) => request('PATCH', url, { body }),
  del: (url) => request('DELETE', url),
  uploadPdf: (url, file) => request('POST', url, { raw: file, contentType: 'application/pdf' }),
};
