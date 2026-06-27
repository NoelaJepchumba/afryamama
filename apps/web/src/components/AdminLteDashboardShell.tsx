'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout } from '@adminlte/react';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/components/AuthProvider';
import { adminMenuItems, doctorMenuItems } from '@/lib/adminlteMenu';
import type { DashboardRole } from '@/lib/firebaseAuth';
import TopbarAccountMenu from '@/components/TopbarAccountMenu';
import { collection, getDocs, limit, query, where } from '@/lib/firebaseClient';
import { firebaseDb } from '@/lib/firebaseClient';

interface AdminLteDashboardShellProps {
  role: DashboardRole;
  allowedRoles?: DashboardRole[];
  children: React.ReactNode;
}

export default function AdminLteDashboardShell({ role, allowedRoles, children }: AdminLteDashboardShellProps) {
  const { role: authenticatedRole, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [resolvedName, setResolvedName] = useState<string>('');
  const effectiveRole = authenticatedRole ?? role;
  const resolvedAllowedRoles = allowedRoles ?? [role];
  const menuItems = effectiveRole === 'ADMIN' ? adminMenuItems : doctorMenuItems;
  const rawUser = (user || {}) as Record<string, unknown>;
  const fallbackName = resolvedName ||
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
    async function loadDisplayName() {
      if (!user?.email && !user?.uid) {
        setResolvedName('');
        return;
      }

      const collectionNames = effectiveRole === 'ADMIN' ? ['Admins'] : ['doctors', 'Doctors'];

      for (const collectionName of collectionNames) {
        if (user?.uid) {
          try {
            const byUidSnapshot = await getDocs(
              query(collection(firebaseDb, collectionName), where('uid', '==', user.uid), limit(1))
            );

            if (!byUidSnapshot.empty) {
              const data = byUidSnapshot.docs[0].data() as Record<string, unknown>;
              const firstName = (data.firstName || data.first_name || '').toString().trim();
              const lastName = (data.lastName || data.last_name || '').toString().trim();
              const fullName = `${firstName} ${lastName}`.trim() || (data.fullName || data.name || '').toString().trim();
              if (fullName) {
                setResolvedName(fullName);
                return;
              }
            }
          } catch {
            // Continue with email lookup fallback.
          }
        }

        const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
        for (const fieldName of emailFields) {
          try {
            const byEmailSnapshot = await getDocs(
              query(collection(firebaseDb, collectionName), where(fieldName, '==', user?.email || ''), limit(1))
            );

            if (!byEmailSnapshot.empty) {
              const data = byEmailSnapshot.docs[0].data() as Record<string, unknown>;
              const firstName = (data.firstName || data.first_name || '').toString().trim();
              const lastName = (data.lastName || data.last_name || '').toString().trim();
              const fullName = `${firstName} ${lastName}`.trim() || (data.fullName || data.name || '').toString().trim();
              if (fullName) {
                setResolvedName(fullName);
                return;
              }
            }
          } catch {
            // Continue checking alternatives.
          }
        }

        if (user?.email) {
          try {
            const allDocs = await getDocs(collection(firebaseDb, collectionName));
            const normalizedEmail = user.email.toLowerCase();
            const matched = allDocs.docs.find((docItem) => {
              const data = docItem.data() as Record<string, unknown>;
              const candidates = [data.email, data.Email, data.userEmail, data.user_email]
                .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
                .filter(Boolean);
              return candidates.includes(normalizedEmail);
            });

            if (matched) {
              const data = matched.data() as Record<string, unknown>;
              const firstName = (data.firstName || data.first_name || '').toString().trim();
              const lastName = (data.lastName || data.last_name || '').toString().trim();
              const fullName =
                `${firstName} ${lastName}`.trim() ||
                (data.fullName || data.name || data.username || '').toString().trim();
              if (fullName) {
                setResolvedName(fullName);
                return;
              }
            }
          } catch {
            // Ignore collection scan failures.
          }
        }
      }

      setResolvedName('');
    }

    loadDisplayName();
  }, [effectiveRole, user?.email, user?.uid]);

  useEffect(() => {
    // Keep light mode as default; users can still toggle afterward.
    const hasExplicitPreference =
      window.localStorage.getItem('theme') ||
      window.localStorage.getItem('color-mode') ||
      window.localStorage.getItem('adminlte-color-mode');

    if (!hasExplicitPreference) {
      document.documentElement.setAttribute('data-bs-theme', 'light');
      document.body.setAttribute('data-bs-theme', 'light');
    }
  }, []);

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
        sidebarTheme="light"
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