'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  loginAdminFromFirestoreDoc,
  loginDoctorWithGoogle,
  loginWithFirebase,
  logoutFromFirebase,
  resolveDashboardRole,
} from '@/lib/firebaseAuth';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { user, role: activeRole, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'DOCTOR' | 'ADMIN'>('DOCTOR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!activeRole) return;
    router.replace(activeRole === 'ADMIN' ? '/admin/dashboard' : '/doctor/dashboard');
  }, [activeRole, authLoading, router, user]);

  const handleRoleSelect = (selectedRole: 'DOCTOR' | 'ADMIN') => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('afyamama-fallback-role');
      window.localStorage.removeItem('afyamama-fallback-email');
    }

    setRole(selectedRole);
    if (selectedRole === 'ADMIN') {
      setEmail('KristieNoela@afyamama.com');
    } else {
      setEmail('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role === 'DOCTOR') {
      return;
    }

    setLoading(true);
    setError('');

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('afyamama-fallback-role');
      window.localStorage.removeItem('afyamama-fallback-email');
    }

    try {
      const credential = await loginWithFirebase(email, password);
      const resolvedRole = await resolveDashboardRole(credential.user);

      if (!resolvedRole) {
        await logoutFromFirebase();
        setError('No dashboard role was found for this account in Firestore.');
        return;
      }

      if (resolvedRole !== role) {
        await logoutFromFirebase();
        setError(`This account is registered as ${resolvedRole}, not ${role}.`);
        return;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('afyamama-fallback-role');
        window.localStorage.removeItem('afyamama-fallback-email');
      }

      router.push(resolvedRole === 'ADMIN' ? '/admin/dashboard' : '/doctor/dashboard');
    } catch (err: unknown) {
      if (role === 'ADMIN') {
        const isFirestoreAdmin = await loginAdminFromFirestoreDoc(email, password);
        if (isFirestoreAdmin) {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('afyamama-fallback-role', 'ADMIN');
            window.localStorage.setItem('afyamama-fallback-email', email.trim().toLowerCase());
          }
          router.push('/admin/dashboard');
          return;
        }
      }

      const errorCode =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : null;

      if (errorCode) {
        if (errorCode === 'auth/user-not-found') {
          setError('This email is not registered in Firebase Authentication.');
        } else if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
          setError('Incorrect password or email.');
        } else if (errorCode === 'auth/too-many-requests') {
          setError('Too many attempts. Please wait and try again.');
        } else {
          setError(`Login failed: ${errorCode}`);
        }
      } else {
        setError('Login failed. Please verify your Firebase credentials.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorGoogleLogin = async () => {
    setLoading(true);
    setError('');

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('afyamama-fallback-role');
      window.localStorage.removeItem('afyamama-fallback-email');
    }

    try {
      const credential = await loginDoctorWithGoogle();
      const resolvedRole = await resolveDashboardRole(credential.user);

      if (resolvedRole !== 'DOCTOR') {
        await logoutFromFirebase();
        setError('This Google account is not registered as a doctor in Firestore.');
        return;
      }

      router.push('/doctor/dashboard');
    } catch (err: unknown) {
      const errorCode =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : null;

      if (errorCode === 'auth/popup-closed-by-user') {
        setError('Google sign-in was cancelled.');
      } else if (errorCode === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups and try again.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto 16px auto' }}>AM</div>
          <h1 className="auth-title">Welcome to AfyaMama</h1>
          <p className="auth-subtitle">Clinical & Administrative Portal</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <span className="form-label">Select Workspace Role</span>
            <div className="role-selector">
              <div 
                className={`role-option ${role === 'DOCTOR' ? 'active' : ''}`}
                onClick={() => handleRoleSelect('DOCTOR')}
              >
                Doctor Portal
              </div>
              <div 
                className={`role-option ${role === 'ADMIN' ? 'active-admin' : ''}`}
                onClick={() => handleRoleSelect('ADMIN')}
              >
                Admin Portal
              </div>
            </div>
          </div>

          {role === 'ADMIN' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Work Email</label>
                <input
                  className="form-input"
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Security Password</label>
                <input
                  className="form-input"
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <Link
                    href={`/admin-forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                    style={{ fontSize: '13px', color: 'var(--primary)' }}
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            </>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '-10px 0 16px 0', textAlign: 'left' }}>
              {error}
            </p>
          )}

          {role === 'DOCTOR' ? (
            <button
              type="button"
              className="btn btn-primary btn-google"
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
              disabled={loading}
              onClick={handleDoctorGoogleLogin}
            >
              <span className="google-icon" aria-hidden="true">G</span>
              {loading ? 'Connecting Google...' : 'Continue with Google'}
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-accent"
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Enter Admin Workspace'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
