'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  loginAdminFromFirestoreDoc,
  loginWithFirebase,
  resolveDashboardRole,
} from '@/lib/firebaseAuth';

export default function AdminLockPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const fallbackEmail =
    typeof window !== 'undefined' ? window.localStorage.getItem('afyamama-fallback-email') || '' : '';
  const email = user?.email || fallbackEmail;

  const returnPath = useMemo(() => {
    if (typeof window === 'undefined') return '/admin/dashboard';
    const saved = window.sessionStorage.getItem('afyamama:lastAdminPath');
    if (!saved || saved === '/admin-lockscreen') return '/admin/dashboard';
    return saved;
  }, []);

  async function unlockSession(event: React.FormEvent) {
    event.preventDefault();

    if (!email) {
      if (loading) {
        setMessage('Still loading session details. Please try again in a moment.');
        return;
      }
      setMessage('No signed-in email was found. Please log in again.');
      return;
    }

    if (!password.trim()) {
      setMessage('Enter your admin password to unlock.');
      return;
    }

    setUnlocking(true);
    setMessage('');

    try {
      let unlocked = false;

      try {
        const credential = await loginWithFirebase(email, password);
        const resolvedRole = await resolveDashboardRole(credential.user);
        unlocked = resolvedRole === 'ADMIN';
      } catch {
        unlocked = false;
      }

      if (!unlocked) {
        unlocked = await loginAdminFromFirestoreDoc(email, password);
      }

      if (!unlocked) {
        setMessage('Password is incorrect for this admin account.');
        return;
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('afyamama:adminLocked');
      }

      router.replace(returnPath);
    } catch {
      setMessage('Could not unlock session. Please try again.');
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto 16px auto' }}>A</div>
          <h1 className="auth-title">AfyaMama</h1>
          <p className="auth-subtitle">Admin Session Locked</p>
        </div>

        <form onSubmit={unlockSession}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <span className="form-label">Signed In Email</span>
            <div
              className="form-input"
              style={{ background: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1', fontWeight: 600 }}
            >
              {email || 'Unknown email'}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="adminUnlockPassword">Password</label>
            <input
              id="adminUnlockPassword"
              className="form-input"
              type="password"
              autoComplete="current-password"
              placeholder="Enter admin password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {message ? (
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '-6px 0 12px 0', textAlign: 'left' }}>
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn-accent"
            style={{ width: '100%', padding: '14px' }}
            disabled={unlocking}
          >
            {unlocking ? 'Unlocking...' : 'Unlock Session'}
          </button>
        </form>
      </div>
    </div>
  );
}
