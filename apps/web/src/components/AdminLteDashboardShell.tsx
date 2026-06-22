'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout } from '@adminlte/react';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/components/AuthProvider';
import { adminMenuItems, doctorMenuItems } from '@/lib/adminlteMenu';
import type { DashboardRole } from '@/lib/firebaseAuth';
import TopbarAccountMenu from '@/components/TopbarAccountMenu';

interface AdminLteDashboardShellProps {
  role: DashboardRole;
  allowedRoles?: DashboardRole[];
  children: React.ReactNode;
}

export default function AdminLteDashboardShell({ role, allowedRoles, children }: AdminLteDashboardShellProps) {
  const { role: authenticatedRole, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const effectiveRole = authenticatedRole ?? role;
  const resolvedAllowedRoles = allowedRoles ?? [role];
  const menuItems = effectiveRole === 'ADMIN' ? adminMenuItems : doctorMenuItems;
  const rawUser = (user || {}) as Record<string, unknown>;
  const fallbackName =
    (typeof rawUser.displayName === 'string' && rawUser.displayName) ||
    (typeof user?.email === 'string' && user.email) ||
    (effectiveRole === 'ADMIN' ? 'Administrator' : 'Doctor');
  const memberSince =
    rawUser.metadata && typeof rawUser.metadata === 'object' && 'creationTime' in rawUser.metadata
      ? ((rawUser.metadata as { creationTime?: string }).creationTime || undefined)
      : undefined;
  const userModel = {
    name: fallbackName,
    image: '/assets/img/user2-160x160.jpg',
    role: effectiveRole,
    memberSince,
  };

  useEffect(() => {
    if (!pathname) return;
    if (effectiveRole !== 'DOCTOR' && effectiveRole !== 'ADMIN') return;

    const lockPath = effectiveRole === 'DOCTOR' ? '/lockscreen' : '/admin-lockscreen';
    const lockRoute = effectiveRole === 'DOCTOR' ? '/lockscreen?reason=timeout' : '/admin-lockscreen?reason=timeout';
    const lockFlagKey = effectiveRole === 'DOCTOR' ? 'afyamama:doctorLocked' : 'afyamama:adminLocked';
    const lastPathKey = effectiveRole === 'DOCTOR' ? 'afyamama:lastDoctorPath' : 'afyamama:lastAdminPath';
    const currentPath = pathname;

    if (currentPath !== lockPath) {
      window.sessionStorage.setItem(lastPathKey, currentPath);
    }

    const isLocked = window.sessionStorage.getItem(lockFlagKey) === '1';
    if (isLocked && currentPath !== lockPath) {
      router.replace(lockPath);
      return;
    }

    if (currentPath === lockPath) {
      return;
    }

    let timeoutId: number | undefined;

    const lockNow = () => {
      window.sessionStorage.setItem(lockFlagKey, '1');
      window.sessionStorage.setItem(lastPathKey, currentPath);
      router.replace(lockRoute);
    };

    const resetTimer = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(lockNow, 5 * 60 * 1000);
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];

    resetTimer();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [effectiveRole, pathname, router]);

  return (
    <RoleGuard allowedRoles={resolvedAllowedRoles}>
      <DashboardLayout
        menuItems={menuItems}
        logo={<span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>AfyaMama</span>}
        fixedHeader
        fixedSidebar
        colorModeToggle
        user={userModel}
        topbarEnd={<TopbarAccountMenu role={effectiveRole} />}
        footer={null}
      >
        {children}
      </DashboardLayout>
    </RoleGuard>
  );
}