const API_BASE = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_BASE_URL || '/api') : process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const tokenStorage = {
  get() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('digichess_token');
  },
  set(token) {
    if (typeof window === 'undefined') return;
    if (token) localStorage.setItem('digichess_token', token);
  },
  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('digichess_token');
  },
};

function buildUrl(path) {
  if (path.startsWith('http')) return path;
  const base = API_BASE.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, headers = {}, token } = options;
  const authToken = token ?? (typeof window !== 'undefined' ? tokenStorage.get() : null);
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (authToken) {
    requestHeaders.Authorization = `Token ${authToken}`;
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    let message = payload?.detail || payload?.message || '';
    // Handle Django field-level errors: { field: ["error1", ...], ... }
    if (!message && payload && typeof payload === 'object') {
      const fieldErrors = Object.entries(payload)
        .filter(([, v]) => Array.isArray(v))
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('. ');
      if (fieldErrors) message = fieldErrors;
    }
    if (!message) message = response.statusText || 'Request failed';
    throw new ApiError(response.status, message, payload);
  }

  return payload;
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  del: (path, body, options) => apiRequest(path, { ...options, method: 'DELETE', body }),
};
