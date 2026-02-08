export class ApiError extends Error {
    constructor(status, message, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const tokenStorage = {
    get() {
        return localStorage.getItem('digichess_token');
    },
    set(token) {
        if (token) {
            localStorage.setItem('digichess_token', token);
        }
    },
    clear() {
        localStorage.removeItem('digichess_token');
    },
};

const buildUrl = (path) => {
    if (path.startsWith('http')) {
        return path;
    }
    if (!path.startsWith('/')) {
        return `${API_BASE}/${path}`;
    }
    return `${API_BASE}${path}`;
};

export const apiRequest = async (path, options = {}) => {
    const { method = 'GET', body, headers, token } = options;
    const authToken = token ?? tokenStorage.get();
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
        const message = payload?.detail || payload?.message || response.statusText || 'Request failed';
        throw new ApiError(response.status, message, payload);
    }

    return payload;
};

export const api = {
    get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
    post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
    del: (path, body, options) => apiRequest(path, { ...options, method: 'DELETE', body }),
};
