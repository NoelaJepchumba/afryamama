'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminForgotPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const email = useMemo(() => (searchParams.get('email') || '').trim().toLowerCase(), [searchParams]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!email) {
      setMessage('Admin email is missing. Go back to login and enter your email first.');
      return;
    }

    if (!/^\d{4}$/.test(pin.trim())) {
      setMessage('Enter your 4-digit admin PIN.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/verify-reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin: pin.trim() }),
      });

      const payload = (await response.json()) as { message?: string; token?: string };
      if (!response.ok) {
        setMessage(payload.message || 'Could not verify admin PIN.');
        return;
      }

      const token = (payload.token || '').trim();
      if (!token) {
        setMessage('Could not start password reset. Please try again.');
        return;
      }

      router.push(`/admin-password-reset?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
    } catch {
      setMessage('Could not verify admin PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto 16px auto' }}>AFYA</div>
          <h1 className="auth-title">Admin PIN Verification</h1>
          <p className="auth-subtitle">Enter your 4-digit admin PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="pin">4-Digit Admin PIN</label>
            <input
              id="pin"
              className="form-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="one-time-code"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter PIN"
              required
            />
          </div>

          {message ? (
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '-8px 0 14px 0', textAlign: 'left' }}>
              {message}
            </p>
          ) : null}

          <button type="submit" className="btn btn-accent" style={{ width: '100%', padding: '14px' }} disabled={loading}>
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <Link href="/" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
