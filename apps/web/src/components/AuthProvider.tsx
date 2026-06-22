'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { firebaseAuth, onAuthStateChanged, type User } from '@/lib/firebaseClient';
import { resolveDashboardRole, type DashboardRole } from '@/lib/firebaseAuth';

interface AuthContextValue {
  user: User | null;
  role: DashboardRole | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<DashboardRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      try {
        const resolvedRole = await resolveDashboardRole(currentUser);
        setRole(resolvedRole);
      } catch {
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ user, role, loading }),
    [user, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
