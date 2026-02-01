import axios from 'axios';

// Get API base URL from environment variable
// In Vercel, this must be set at build time
const apiBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Debug logging (remove in production if needed)
if (typeof window !== 'undefined') {
  console.log('API Base URL:', apiBaseURL);
  console.log('Environment VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
}

const api = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true
});

const AUTH_EXEMPT_PATHS = [
  /^\/api\/accounts\/login\/?$/i,
  /^\/api\/accounts\/register\/?$/i,
  /^\/api\/accounts\/verify-otp\/?$/i,
  /^\/api\/accounts\/resend-otp\/?$/i,
  /^\/api\/accounts\/forgot-password\/?$/i,
  /^\/api\/accounts\/reset-password\/?$/i,
  /^\/api\/accounts\/forgot-username\/?$/i,
  /^\/api\/accounts\/verify-forgot-otp\/?$/i,
  /^\/api\/games\/public\/?$/i,
  /^\/api\/games\/leaderboard\/?.*$/i,
];

api.interceptors.request.use((config) => {
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Token ${token}`;
    } else {
      const url = config.url || '';
      const path = url.startsWith('http') ? new URL(url).pathname : url;
      const isExempt = AUTH_EXEMPT_PATHS.some((re) => re.test(path));
      if (!isExempt && path.startsWith('/api/')) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Please log in to continue.', type: 'info' }
          }));
        }
        return Promise.reject(new axios.Cancel('auth_required'));
      }
    }
  }
  
  // Debug: Log the full URL being requested
  if (typeof window !== 'undefined') {
    const fullURL = config.baseURL 
      ? (config.baseURL.endsWith('/') ? config.baseURL.slice(0, -1) : config.baseURL) + 
        (config.url?.startsWith('/') ? config.url : '/' + config.url)
      : config.url;
    console.log(`[API Request] ${config.method?.toUpperCase()} ${fullURL}`);
  }
  
  return config;
});

// Add response interceptor for error debugging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error) && error.message === 'auth_required') {
      return Promise.reject(error);
    }
    if (typeof window !== 'undefined') {
      if (error.response?.status === 401) {
        try {
          localStorage.removeItem('token');
        } catch {
          // ignore storage errors
        }
        window.dispatchEvent(new Event('auth-changed'));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message: 'Session expired. Please log in again.', type: 'info' }
          }));
        }
        if (!window.location.hash.includes('/login')) {
          window.location.hash = '#/login';
        }
      }
      console.error('[API Error]', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        status: error.response?.status,
        message: error.message,
      });
    }
    return Promise.reject(error);
  }
);

export default api;
