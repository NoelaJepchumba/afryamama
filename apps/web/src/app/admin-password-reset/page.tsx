'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminPasswordResetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const email = useMemo(() => (searchParams.get('email') || '').trim().toLowerCase(), [searchParams]);
  const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!email || !token) {
      setMessage('Verification session is missing. Start again from Forgot password.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setMessage('Enter new password and confirm password.');
      return;
    }

    if (newPassword.length < 8) {
      setMessage('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword, confirmPassword }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message || 'Could not reset password.');
        return;
      }

      setMessage('Password changed successfully. Redirecting to login...');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        router.replace('/');
      }, 1200);
    } catch {
      setMessage('Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto 16px auto' }}>AFYA</div>
          <h1 className="auth-title">Admin Password Reset</h1>
          <p className="auth-subtitle">Create a new password for your admin account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>

          {message ? (
            <p style={{ color: message.includes('successfully') ? 'var(--success)' : 'var(--danger)', fontSize: '13px', margin: '-8px 0 14px 0', textAlign: 'left' }}>
              {message}
            </p>
          ) : null}

          <button type="submit" className="btn btn-accent" style={{ width: '100%', padding: '14px' }} disabled={loading}>
            {loading ? 'Saving...' : 'Save New Password'}
          </button>
        </form>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <Link href="/" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
