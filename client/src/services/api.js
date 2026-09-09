import axios from 'axios';

// Empty base URL keeps requests relative so the Vite dev proxy handles them.
export const API_ORIGIN = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: `${API_ORIGIN}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('annam_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Fired when a stored token is rejected, so AuthContext can clear the session. */
export const UNAUTHORIZED_EVENT = 'annam:unauthorized';

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // An expired or revoked token should not leave the UI half-signed-in. Drop it
    // and let the router decide: protected pages redirect, public pages just
    // render signed-out rather than throwing the reader at a login screen.
    if (error.response?.status === 401 && localStorage.getItem('annam_token')) {
      localStorage.removeItem('annam_token');
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Pulls a readable message out of an axios error. */
export const errMsg = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.details?.[0]?.message || error?.response?.data?.error || error?.message || fallback;

/** Local uploads come back as /uploads/... and need the API origin in production. */
export const mediaUrl = (url) => (!url || url.startsWith('http') ? url : `${API_ORIGIN}${url}`);

export default api;
