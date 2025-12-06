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

api.interceptors.request.use((config) => {
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Token ${token}`;
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
    if (typeof window !== 'undefined') {
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
