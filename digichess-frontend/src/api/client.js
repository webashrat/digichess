export class ApiError extends Error {
    constructor(status, message, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const REFRESH_PATH = '/accounts/refresh/';
let refreshPromise = null;

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

const parseResponsePayload = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    return null;
};

export const refreshAccessToken = async () => {
    if (refreshPromise) {
        return refreshPromise;
    }
    refreshPromise = (async () => {
        const response = await fetch(buildUrl(REFRESH_PATH), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
        const payload = await parseResponsePayload(response);
        if (!response.ok) {
            tokenStorage.clear();
            const message = payload?.detail || response.statusText || 'Session expired';
            throw new ApiError(response.status, message, payload);
        }
        const nextToken = payload?.token;
        if (nextToken) {
            tokenStorage.set(nextToken);
        }
        return payload;
    })();
    try {
        return await refreshPromise;
    } finally {
        refreshPromise = null;
    }
};

export const apiRequest = async (path, options = {}) => {
    const {
        method = 'GET',
        body,
        headers,
        token,
        noAuth = false,
        retryOnAuthError = true,
    } = options;
    const authToken = noAuth ? null : (token ?? tokenStorage.get());
    const requestHeaders = {
        'Content-Type': 'application/json',
        ...headers,
    };
    if (authToken) {
        requestHeaders.Authorization = `Token ${authToken}`;
    }

    const requestWithToken = (tokenValue) => {
        const dynamicHeaders = { ...requestHeaders };
        if (noAuth) {
            delete dynamicHeaders.Authorization;
        } else if (tokenValue) {
            dynamicHeaders.Authorization = `Token ${tokenValue}`;
        } else {
            delete dynamicHeaders.Authorization;
        }
        return fetch(buildUrl(path), {
            method,
            headers: dynamicHeaders,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'include',
        });
    };

    let response = await requestWithToken(authToken);
    if (
        response.status === 401
        && retryOnAuthError
        && !noAuth
        && path !== REFRESH_PATH
    ) {
        try {
            const refreshed = await refreshAccessToken();
            response = await requestWithToken(refreshed?.token || tokenStorage.get());
        } catch {
            // allow final 401 handling below
        }
    }

    const payload = await parseResponsePayload(response);

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
