'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function DoctorLockPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const fallbackEmail =
    typeof window !== 'undefined' ? window.localStorage.getItem('afyamama-fallback-email') || '' : '';
  const email = user?.email || fallbackEmail;

  const returnPath = useMemo(() => {
    if (typeof window === 'undefined') return '/doctor/dashboard';
    const saved = window.sessionStorage.getItem('afyamama:lastDoctorPath');
    if (!saved || saved === '/lockscreen') return '/doctor/dashboard';
    return saved;
  }, []);

  async function sendCode() {
    if (!email) {
      if (loading) {
        setMessage('Still loading session details. Please try again in a moment.');
        return;
      }
      setMessage('Unable to send code because no signed-in email was found.');
      return;
    }

    setSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/doctor-lock/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message || 'Could not send activation code.');
        return;
      }

      setMessage(`Activation code sent to ${email}.`);
    } catch {
      setMessage('Could not send activation code.');
    } finally {
      setSending(false);
    }
  }

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

    if (!code.trim()) {
      setMessage('Enter the activation code from your email.');
      return;
    }

    setVerifying(true);
    setMessage('');

    try {
      const response = await fetch('/api/doctor-lock/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message || 'Invalid activation code.');
        return;
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('afyamama:doctorLocked');
      }

      router.replace(returnPath);
    } catch {
      setMessage('Could not verify the activation code.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto 16px auto' }}>A</div>
          <h1 className="auth-title">AfyaMama</h1>
          <p className="auth-subtitle">Doctor Session Locked</p>
        </div>

        <div className="form-group" style={{ textAlign: 'left' }}>
          <span className="form-label">Signed In Email</span>
          <div
            className="form-input"
            style={{ background: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1', fontWeight: 600 }}
          >
            {email || 'Unknown email'}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', padding: '12px', marginBottom: 14 }}
          onClick={sendCode}
          disabled={sending}
        >
          {sending ? 'Sending...' : 'Send activation code to email'}
        </button>

        <form onSubmit={unlockSession}>
          <div className="form-group">
            <label className="form-label" htmlFor="activationCode">Activation code</label>
            <input
              id="activationCode"
              className="form-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter the 6-digit code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>

          {message ? (
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '-6px 0 12px 0', textAlign: 'left' }}>
              {message}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px' }} disabled={verifying}>
            {verifying ? 'Unlocking...' : 'Unlock Session'}
          </button>
        </form>
      </div>
    </div>
  );
}
