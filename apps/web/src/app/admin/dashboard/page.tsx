'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

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
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [doctorsSnapshot, mothersSnapshot, notificationsSnapshot, adminsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'doctors')),
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'notifications')),
          getDocs(collection(firebaseDb, 'Admins')),
        ]);

        setMetrics({
          clinicians: doctorsSnapshot.size,
          users: doctorsSnapshot.size + mothersSnapshot.size + adminsSnapshot.size,
          alerts: notificationsSnapshot.size,
          admins: adminsSnapshot.size,
        });
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
              Includes admins, doctors, and mothers
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
            <div className="stat-value stat-value-status">{systemStatus}</div>
            <span className="stat-desc">
              Admin nodes and Firebase connectivity check
            </span>
          </div>
        </div>
      </main>
  );
}
