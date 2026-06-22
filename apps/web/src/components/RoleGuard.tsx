'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import type { DashboardRole } from '@/lib/firebaseAuth';

interface RoleGuardProps {
  allowedRoles: DashboardRole[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const [fallbackRole, setFallbackRole] = useState<DashboardRole | null>(null);
  const [fallbackChecked, setFallbackChecked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = window.localStorage.getItem('afyamama-fallback-role');
    if (value === 'ADMIN' || value === 'DOCTOR') {
      setFallbackRole(value);
    }
    setFallbackChecked(true);
  }, []);

  const hasAccess = useMemo(() => {
    if (user) {
      return !!role && allowedRoles.includes(role);
    }

    const fallbackRoleAllowed = !!fallbackRole && allowedRoles.includes(fallbackRole);
    return fallbackRoleAllowed;
  }, [allowedRoles, fallbackRole, role, user]);

  useEffect(() => {
    if (loading || !fallbackChecked) return;
    if (!hasAccess) {
      router.replace('/');
    }
  }, [fallbackChecked, hasAccess, loading, router]);

  if (!loading && fallbackChecked && !hasAccess) {
    return null;
  }

  return <>{children}</>;
}
