'use client';

import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';

interface NotificationRow {
  id: string;
  category: 'Prenatal' | 'Postnatal';
  title: string;
  message: string;
  date: string;
  status: 'Draft' | 'Sent' | 'Scheduled';
  scheduledAt: string | null;
  sentAt: string | null;
}

export default function AdminNotificationsPage() {
  const [category, setCategory] = useState<'Prenatal' | 'Postnatal'>('Prenatal');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [history, setHistory] = useState<NotificationRow[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingNow, setSavingNow] = useState(false);
  const [savingScheduled, setSavingScheduled] = useState(false);

  useEffect(() => {
    async function loadNotifications() {
      const snapshot = await getDocs(collection(firebaseDb, 'notifications'));
      const rows: NotificationRow[] = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          category: data.category === 'Postnatal' ? 'Postnatal' : 'Prenatal',
          title: data.title || 'Untitled',
          message: data.message || '',
          date: data.date || new Date().toISOString().slice(0, 10),
          status:
            data.status === 'Draft' || data.status === 'Scheduled' || data.status === 'Sent'
              ? data.status
              : 'Sent',
          scheduledAt: data.scheduledAt || null,
          sentAt: data.sentAt || null,
        };
      });
      setHistory(rows.reverse());
    }

    loadNotifications();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void dispatchDueScheduledNotifications();
    }, 30000);

    void dispatchDueScheduledNotifications();

    return () => {
      window.clearInterval(timer);
    };
  }, [history]);

  async function dispatchDueScheduledNotifications() {
    const now = Date.now();
    const dueRows = history.filter((row) => {
      if (row.status !== 'Scheduled' || !row.scheduledAt) return false;
      const scheduledTs = new Date(row.scheduledAt).getTime();
      return Number.isFinite(scheduledTs) && scheduledTs <= now;
    });

    if (dueRows.length === 0) return;

    for (const row of dueRows) {
      await updateDoc(doc(firebaseDb, 'notifications', row.id), {
        status: 'Sent',
        sentAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
      });
    }

    setHistory((prev) =>
      prev.map((row) => {
        const matched = dueRows.find((item) => item.id === row.id);
        if (!matched) return row;
        return {
          ...row,
          status: 'Sent',
          sentAt: new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
        };
      })
    );
  }

  const saveAndSendNow = async () => {
    if (!title.trim() || !message.trim()) return;

    setSavingNow(true);
    setSaveError(null);
    setSaveMessage(null);

    const nextPayload = {
      category,
      title: title.trim(),
      message: message.trim(),
      date: new Date().toISOString().slice(0, 10),
      status: 'Sent' as const,
      scheduledAt: null,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    try {
      const ref = await addDoc(collection(firebaseDb, 'notifications'), nextPayload);

      const next: NotificationRow = {
        id: ref.id,
        ...nextPayload,
      };

      setHistory((prev) => [next, ...prev]);
      setTitle('');
      setMessage('');
      setScheduledAt('');
      setSaveMessage('Notification saved and sent now.');
    } catch {
      setSaveError('Could not send notification now.');
    } finally {
      setSavingNow(false);
    }
  };

  const saveAndSchedule = async () => {
    if (!title.trim() || !message.trim()) return;

    if (!scheduledAt) {
      setSaveError('Please choose a schedule date and time.');
      setSaveMessage(null);
      return;
    }

    const scheduledIso = new Date(scheduledAt).toISOString();
    if (Number.isNaN(new Date(scheduledIso).getTime())) {
      setSaveError('Invalid schedule date/time.');
      setSaveMessage(null);
      return;
    }

    setSavingScheduled(true);
    setSaveError(null);
    setSaveMessage(null);

    const nextPayload = {
      category,
      title: title.trim(),
      message: message.trim(),
      date: new Date().toISOString().slice(0, 10),
      status: 'Scheduled' as const,
      scheduledAt: scheduledIso,
      sentAt: null,
      createdAt: new Date().toISOString(),
    };

    try {
      const ref = await addDoc(collection(firebaseDb, 'notifications'), nextPayload);

      const next: NotificationRow = {
        id: ref.id,
        ...nextPayload,
      };

      setHistory((prev) => [next, ...prev]);
      setTitle('');
      setMessage('');
      setScheduledAt('');
      setSaveMessage('Notification saved and scheduled for later.');
    } catch {
      setSaveError('Could not save scheduled notification.');
    } finally {
      setSavingScheduled(false);
    }
  };

  const deleteNotification = async (id: string) => {
    await deleteDoc(doc(firebaseDb, 'notifications', id));
    setHistory((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">Create Wellness Notification</h1>
        </div>
      </div>

      <div className="content-card">
        <div className="form-group">
          <label className="form-label" htmlFor="notif-category">Notification Type</label>
          <select
            id="notif-category"
            className="form-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as 'Prenatal' | 'Postnatal')}
          >
            <option value="Prenatal">Prenatal Wellness</option>
            <option value="Postnatal">Postnatal Wellness</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="notif-title">Title</label>
          <input
            id="notif-title"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter title"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="notif-message">Wellness Message</label>
          <textarea
            id="notif-message"
            className="form-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write wellness tip"
            rows={4}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="notif-scheduled-at">Schedule Date & Time</label>
          <input
            id="notif-scheduled-at"
            className="form-input"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        <div className="action-row" style={{ marginTop: 0 }}>
          <button className="btn btn-primary" onClick={saveAndSendNow} disabled={savingNow || savingScheduled}>
            {savingNow ? 'Saving...' : 'Save & Send Now'}
          </button>
          <button className="btn btn-secondary" onClick={saveAndSchedule} disabled={savingNow || savingScheduled}>
            {savingScheduled ? 'Scheduling...' : 'Save & Schedule for Later'}
          </button>
          {saveMessage ? <span style={{ color: 'var(--success)' }}>{saveMessage}</span> : null}
          {saveError ? <span style={{ color: 'var(--danger)' }}>{saveError}</span> : null}
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>History</span>
        </div>

        <div className="stack-grid">
          {history.map((n) => (
            <div key={n.id} className="history-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <strong>{n.title}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {n.category} | {n.date} | {n.status}
                    {n.status === 'Scheduled' && n.scheduledAt ? ` | Scheduled: ${new Date(n.scheduledAt).toLocaleString()}` : ''}
                    {n.status === 'Sent' && n.sentAt ? ` | Sent: ${new Date(n.sentAt).toLocaleString()}` : ''}
                  </div>
                </div>
                <button className="btn btn-secondary btn-compact" onClick={() => deleteNotification(n.id)}>
                  Delete
                </button>
              </div>
              <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{n.message}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
