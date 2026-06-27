'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useAuth } from '@/components/AuthProvider';
import { firebaseDb } from '@/lib/firebaseClient';
import { logoutFromFirebase, type DashboardRole } from '@/lib/firebaseAuth';

interface TopbarAccountMenuProps {
  role: DashboardRole;
}

interface ProfileModel {
  name: string;
  email: string;
  title: string;
  memberSince: string;
}

interface QuickStats {
  clinicians: number;
  mothers: number;
  notifications: number;
}

const emptyProfile: ProfileModel = {
  name: '',
  email: '',
  title: '',
  memberSince: '',
};

function toDateLabel(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }

  return '';
}

export default function TopbarAccountMenu({ role }: TopbarAccountMenuProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileModel>(emptyProfile);
  const [stats, setStats] = useState<QuickStats>({ clinicians: 0, mothers: 0, notifications: 0 });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.email && !user?.uid) {
        setProfile({
          ...emptyProfile,
          name: role === 'ADMIN' ? 'Administrator' : 'Doctor',
        });
        return;
      }

      const collectionNames = role === 'ADMIN' ? ['Admins'] : ['doctors', 'Doctors'];
      let found: Record<string, unknown> | null = null;

      for (const collectionName of collectionNames) {
        if (user?.uid) {
          try {
            const byUidSnapshot = await getDocs(
              query(collection(firebaseDb, collectionName), where('uid', '==', user.uid), limit(1))
            );
            if (!byUidSnapshot.empty) {
              found = byUidSnapshot.docs[0].data() as Record<string, unknown>;
              break;
            }
          } catch {
            // Continue with email fallback.
          }
        }

        const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
        for (const fieldName of emailFields) {
          try {
            const snapshot = await getDocs(
              query(collection(firebaseDb, collectionName), where(fieldName, '==', user.email), limit(1))
            );
            if (!snapshot.empty) {
              found = snapshot.docs[0].data() as Record<string, unknown>;
              break;
            }
          } catch {
            // Continue checking other field variants.
          }
        }

        if (!found && user?.email) {
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
              found = matched.data() as Record<string, unknown>;
            }
          } catch {
            // Ignore collection scan failures.
          }
        }

        if (found) {
          break;
        }
      }

      const firstName = (found?.firstName || found?.first_name || '').toString();
      const lastName = (found?.lastName || found?.last_name || '').toString();
      const name =
        `${firstName} ${lastName}`.trim() ||
        (found?.fullName || found?.name || found?.username || '').toString().trim() ||
        user.displayName ||
        user.email ||
        (role === 'ADMIN' ? 'Administrator' : 'Doctor');

      setProfile({
        name,
        email: (found?.email || found?.Email || found?.userEmail || found?.user_email || user.email || '').toString(),
        title: (
          found?.title ||
          found?.role ||
          found?.Role ||
          (role === 'ADMIN' ? 'Administrator' : 'Doctor')
        ).toString(),
        memberSince: toDateLabel(found?.createdAt || found?.created_at || user.metadata.creationTime),
      });
    }

    async function loadStats() {
      const [doctorsSnapshot, mothersSnapshot, notificationsSnapshot] = await Promise.all([
        getDocs(collection(firebaseDb, 'doctors')),
        getDocs(collection(firebaseDb, 'mothers')),
        getDocs(collection(firebaseDb, 'notifications')),
      ]);

      setStats({
        clinicians: doctorsSnapshot.size,
        mothers: mothersSnapshot.size,
        notifications: notificationsSnapshot.size,
      });
    }

    loadProfile();
    loadStats();
  }, [role, user?.email, user?.uid, user?.displayName, user?.metadata.creationTime]);

  const initials = useMemo(() => {
    const parts = profile.name.split(' ').filter(Boolean);
    const joined = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
    return joined || 'U';
  }, [profile.name]);

  async function onLogout() {
    try {
      setLoggingOut(true);
      await logoutFromFirebase();
      router.replace('/');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <li className="nav-item dropdown custom-user-menu">
      <button
        type="button"
        className="nav-link dropdown-toggle d-flex align-items-center"
        data-bs-toggle="dropdown"
      >
        <span className="custom-user-avatar">{initials}</span>
        <span className="d-none d-md-inline ms-2">{profile.name}</span>
      </button>

      <ul className="dropdown-menu dropdown-menu-lg dropdown-menu-end">
        <li className="user-header text-bg-primary">
          <div className="custom-user-avatar-lg mx-auto mb-2">{initials}</div>
          <p>
            {profile.name}
            {profile.title ? ` - ${profile.title}` : ''}
            {profile.memberSince && <small>Member since {profile.memberSince}</small>}
          </p>
          {profile.email ? (
            <small style={{ opacity: 0.9 }}>{profile.email}</small>
          ) : null}
        </li>

        <li className="user-body">
          <div className="row">
            <div className="col-4 text-center">
              <span>{stats.clinicians}</span>
              <small style={{ display: 'block' }}>Clinicians</small>
            </div>
            <div className="col-4 text-center">
              <span>{stats.mothers}</span>
              <small style={{ display: 'block' }}>Mothers</small>
            </div>
            <div className="col-4 text-center">
              <span>{stats.notifications}</span>
              <small style={{ display: 'block' }}>Alerts</small>
            </div>
          </div>
        </li>

        <li className="user-footer">
          <Link href={role === 'ADMIN' ? '/admin/profile' : '/doctor/profile'} className="btn btn-outline-secondary">
            Profile
          </Link>
          <button
            type="button"
            className="btn btn-outline-danger float-end"
            onClick={onLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </li>
      </ul>
    </li>
  );
}
