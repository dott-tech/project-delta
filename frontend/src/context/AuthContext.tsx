import React, { useState, useEffect } from 'react';
import { AuthContext, type User } from './auth-context';

const readCachedUser = (): User | null => {
  if (!localStorage.getItem('token')) return null;
  const savedUser = localStorage.getItem('user');
  if (!savedUser) return null;
  try {
    return JSON.parse(savedUser) as User;
  } catch (error) {
    console.error('Failed to parse cached user:', error);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(readCachedUser);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const loading = false;

  useEffect(() => {
    const handleExpiredSession = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('auth:expired', handleExpiredSession);
    return () => window.removeEventListener('auth:expired', handleExpiredSession);
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
