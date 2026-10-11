import axios from 'axios';

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};
