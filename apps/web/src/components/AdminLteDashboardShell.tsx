'use client';

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
  const effectiveRole = authenticatedRole ?? role;
  const resolvedAllowedRoles = allowedRoles ?? [role];
  const menuItems = effectiveRole === 'ADMIN' ? adminMenuItems : doctorMenuItems;
  const fallbackName = user?.displayName || user?.email || (effectiveRole === 'ADMIN' ? 'Administrator' : 'Doctor');
  const userModel = {
    name: fallbackName,
    image: '/assets/img/user2-160x160.jpg',
    role: effectiveRole,
    memberSince: user?.metadata.creationTime || undefined,
  };

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