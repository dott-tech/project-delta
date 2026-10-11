import axios from 'axios';

export const api = axios.create({
  // Use Vite's same-origin proxy in development to avoid browser CORS preflights.
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Automatically inject JWT token from localStorage into request headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error.config?.url || '');
    const isAuthSubmission = requestUrl.endsWith('/auth/login') || requestUrl.endsWith('/auth/register');
    if (error.response?.status === 401 && !isAuthSubmission && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  },
);
