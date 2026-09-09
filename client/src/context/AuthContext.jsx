import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { UNAUTHORIZED_EVENT } from '../services/api.js';
import { closeSocket } from '../services/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only "loading" when there is actually a token to verify, so a signed-out
  // visitor renders immediately instead of flashing a spinner.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('annam_token')));

  // Restore the session from a stored token on first paint.
  useEffect(() => {
    if (!localStorage.getItem('annam_token')) return;

    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem('annam_token'))
      .finally(() => setLoading(false));
  }, []);

  // A rejected token anywhere in the app signs the user out here, in React state,
  // instead of hard-navigating away from whatever page they are on.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const persist = useCallback(({ token, user: u }) => {
    localStorage.setItem('annam_token', token);
    closeSocket(); // force a reconnect carrying the new token
    setUser(u);
    return u;
  }, []);

  const login = useCallback(
    async (email, password) => persist((await api.post('/auth/login', { email, password })).data),
    [persist]
  );

  const register = useCallback(
    async (payload) => persist((await api.post('/auth/register', payload)).data),
    [persist]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('annam_token');
    closeSocket();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
