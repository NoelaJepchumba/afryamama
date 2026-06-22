'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, firebaseDb, type QueryDocumentSnapshot, type DocumentData } from '@/lib/firebaseClient';

interface DashboardUserRow {
  id: string;
  email: string;
  role: string;
  createdDate: string;
  status: string;
}

interface DashboardMetrics {
  clinicians: number;
  users: number;
  alerts: number;
  admins: number;
}

const emptyMetrics: DashboardMetrics = {
  clinicians: 0,
  users: 0,
  alerts: 0,
  admins: 0,
};

function readDate(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    } catch {
      return '-';
    }
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return '-';
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [rows, setRows] = useState<DashboardUserRow[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [doctorsSnapshot, mothersSnapshot, notificationsSnapshot, usersSnapshot, adminsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'doctors')),
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'notifications')),
          getDocs(collection(firebaseDb, 'users')),
          getDocs(collection(firebaseDb, 'admins')),
        ]);

        const usersRows = usersSnapshot.docs.map((docItem: QueryDocumentSnapshot<DocumentData>) => {
          const data = docItem.data();
          const role = (data.role || data.Role || 'USER').toString().toUpperCase();
          return {
            id: docItem.id,
            email: (data.email || data.Email || '-').toString(),
            role,
            createdDate: readDate(data.createdAt || data.created_at),
            status: (data.status || 'Active').toString(),
          };
        });

        setMetrics({
          clinicians: doctorsSnapshot.size,
          users: usersSnapshot.size + mothersSnapshot.size + adminsSnapshot.size,
          alerts: notificationsSnapshot.size,
          admins: adminsSnapshot.size,
        });

        setRows(usersRows.slice(0, 10));
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const systemStatus = useMemo(() => {
    if (loading) return 'CHECKING';
    return 'ONLINE';
  }, [loading]);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Administrator Dashboard</h1>
            <p className="page-subtitle">System metrics, logs, and user management center.</p>
          </div>
        </div>

        <div className="card-grid">
          <div className="stat-card secondary">
            <span className="stat-title">Registered Clinicians</span>
            <div className="stat-value">{loading ? '...' : metrics.clinicians.toLocaleString()}</div>
            <span className="stat-desc">
              Obstetricians, Pediatricians, Nurses from Firestore
            </span>
          </div>

          <div className="stat-card secondary">
            <span className="stat-title">Total Registered Users</span>
            <div className="stat-value">{loading ? '...' : metrics.users.toLocaleString()}</div>
            <span className="stat-desc">
              Includes admins, doctors, mothers, and users documents
            </span>
          </div>

          <div className="stat-card secondary">
            <span className="stat-title">Dispatched Alerts</span>
            <div className="stat-value">{loading ? '...' : metrics.alerts.toLocaleString()}</div>
            <span className="stat-desc">
              Notifications stored in Firestore
            </span>
          </div>

          <div className="stat-card secondary">
            <span className="stat-title">System Status</span>
            <div className="stat-value" style={{ color: 'var(--success)', background: 'none', WebkitTextFillColor: 'initial' }}>{systemStatus}</div>
            <span className="stat-desc">
              Admin nodes and Firebase connectivity check
            </span>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>System Users & Activity</span>
            <Link href="/admin/reports" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
              Audit Logs
            </Link>
          </div>
          
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Email Address</th>
                  <th>Workspace Role</th>
                  <th>Created Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading users from Firestore...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No user activity records found in Firestore.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.email}</td>
                      <td>
                        <span className="badge badge-success" style={{ color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.2)', backgroundColor: 'rgba(139, 92, 246, 0.05)' }}>
                          {row.role}
                        </span>
                      </td>
                      <td>{row.createdDate}</td>
                      <td><span className="badge badge-success">{row.status}</span></td>
                      <td>
                        <Link href="/admin/users" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
  );
}
