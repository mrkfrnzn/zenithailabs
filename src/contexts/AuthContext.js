import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('survivor_token');
    if (!token) { setLoading(false); return; }
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      localStorage.removeItem('survivor_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = (token, userData) => {
    localStorage.setItem('survivor_token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('survivor_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
