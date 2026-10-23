import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { beginActionLoading } from '../utils/actionLoading';

export const api = axios.create({
  // Use Vite's same-origin proxy in development to avoid browser CORS preflights.
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const trackedActions = new WeakMap<InternalAxiosRequestConfig, () => void>();

const getActionLabel = (method: string, url: string) => {
  if (url.endsWith('/auth/login')) return 'Signing you in';
  if (url.endsWith('/auth/register')) return 'Creating your account';
  if (url.includes('/invitations')) return 'Updating invitations';
  if (url.includes('/phases')) return 'Updating project phase';
  if (url.includes('/members')) return 'Updating the project team';
  if (url.includes('/files')) return 'Updating project files';
  if (url.includes('/upload-url')) return 'Preparing your upload';
  if (method === 'delete') return 'Removing item';
  if (url.endsWith('/projects') && method === 'post') return 'Creating project';
  return 'Saving your changes';
};

const finishTrackedAction = (config?: InternalAxiosRequestConfig) => {
  if (!config) return;
  const finish = trackedActions.get(config);
  if (!finish) return;
  trackedActions.delete(config);
  finish();
};

// Automatically inject JWT token from localStorage into request headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const method = (config.method || 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method)) {
    const label = getActionLabel(method, String(config.url || ''));
    trackedActions.set(config, beginActionLoading(label));
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    finishTrackedAction(response.config);
    return response;
  },
  (error) => {
    finishTrackedAction(error.config);
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
