import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserProfile, UserRole } from '../../shared/types';
import { apiRequest } from '../lib/api';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  tamperLabEnabled: boolean;
  login: (identifier: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function getDefaultRouteForRole(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return '/dashboard';
    case UserRole.EXAMINER:
      return '/approvals/examiner';
    case UserRole.CONTROLLER:
      return '/approvals/controller';
    case UserRole.STUDENT:
      return '/student';
    default:
      return '/';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tamperLabEnabled, setTamperLabEnabled] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest<{
        authenticated: boolean;
        user: UserProfile | null;
        tamperLabEnabled: boolean;
      }>('/api/auth/session');
      setUser(data.authenticated ? data.user : null);
      setTamperLabEnabled(Boolean(data.tamperLabEnabled));
    } catch {
      setUser(null);
      setTamperLabEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiRequest<{ user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setUser(data.user);
    try {
      const info = await apiRequest<{ tamperLabEnabled: boolean }>('/api/system/info');
      setTamperLabEnabled(Boolean(info.tamperLabEnabled));
    } catch {
      // keep existing
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, tamperLabEnabled, login, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
