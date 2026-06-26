'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { collection, doc, getDocs, query, updateDoc, where, firebaseDb } from '@/lib/firebaseClient';

type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

interface AppointmentRow {
  id: string;
  name: string;
  reason: string;
  time: string;
  status: AppointmentStatus;
}

function toDateTimeLabel(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return value;
  }
  return '-';
}

function toStatus(value: unknown): AppointmentStatus {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'PENDING';
  if (normalized === 'CONFIRMED' || normalized === 'CANCELLED' || normalized === 'COMPLETED') return normalized;
  return 'PENDING';
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        const [appointmentsSnapshot, mothersSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'appointments')),
          getDocs(collection(firebaseDb, 'mothers')),
        ]);

        const motherNameById = new Map<string, string>();
        mothersSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = (data.firstName || data.first_name || '').toString().trim();
          const lastName = (data.lastName || data.last_name || '').toString().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          motherNameById.set(docItem.id, fullName || (data.full_name || data.name || 'Mother').toString());
        });

        const rows: AppointmentRow[] = appointmentsSnapshot.docs
          .filter((docItem) => {
            const data = docItem.data() as Record<string, unknown>;

            const candidateEmails = [data.doctorEmail, data.doctor_email, data.email]
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim().toLowerCase());

            const candidateUids = [data.doctorUid, data.doctor_uid, data.doctorId]
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim());

            return candidateEmails.includes(user.email!.trim().toLowerCase()) || candidateUids.includes(user.uid);
          })
          .map((docItem) => {
            const data = docItem.data() as Record<string, unknown>;
            const motherId = (data.motherId || data.mother_id || '').toString();
            const firstName = (data.motherFirstName || data.firstName || '').toString().trim();
            const lastName = (data.motherLastName || data.lastName || '').toString().trim();
            const inlineName = `${firstName} ${lastName}`.trim();

            return {
              id: docItem.id,
              name:
                inlineName ||
                (data.motherName || data.patientName || '').toString() ||
                motherNameById.get(motherId) ||
                'Mother',
              reason: (data.reason || data.notes || data.appointmentType || 'Consultation').toString(),
              time: toDateTimeLabel(data.dateTime || data.appointmentTime || data.date),
              status: toStatus(data.status),
            };
          });

        if (isMounted) {
          setAppointments(rows);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAppointments();

    return () => {
      isMounted = false;
    };
  }, [user?.email, user?.uid]);

  const handleStatusChange = async (id: string, nextStatus: Exclude<AppointmentStatus, 'PENDING'>) => {
    setSavingId(id);
    try {
      await updateDoc(doc(firebaseDb, 'appointments', id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });

      setAppointments((prev) => prev.map((appt) => (appt.id === id ? { ...appt, status: nextStatus } : appt)));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Appointments Scheduler</h1>
            <p className="page-subtitle">Schedule clinical consultations, track antenatal care (ANC) visits, and infant checkups.</p>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>Consultation Schedule</span>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Reason for Consultation</th>
                  <th>Scheduled Date & Time</th>
                  <th>Status</th>
                  <th>Control Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Loading appointments from Firestore...</td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No appointments found for this doctor.</td>
                  </tr>
                ) : (
                  appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td style={{ fontWeight: '600' }}>{appt.name}</td>
                      <td>{appt.reason}</td>
                      <td>{appt.time}</td>
                      <td>
                        <span className={`badge ${
                          appt.status === 'CONFIRMED' ? 'badge-success' :
                          appt.status === 'PENDING' ? 'badge-warning' :
                          appt.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'
                        }`}>
                          {appt.status}
                        </span>
                      </td>
                      <td>
                        {appt.status === 'PENDING' && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                              onClick={() => handleStatusChange(appt.id, 'CONFIRMED')}
                              disabled={savingId === appt.id}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--danger)' }}
                              onClick={() => handleStatusChange(appt.id, 'CANCELLED')}
                              disabled={savingId === appt.id}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                        {appt.status === 'CONFIRMED' && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                            disabled={savingId === appt.id}
                          >
                            Mark Completed
                          </button>
                        )}
                        {appt.status === 'COMPLETED' && (
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No Action Required</span>
                        )}
                        {appt.status === 'CANCELLED' && (
                          <span style={{ fontSize: '13px', color: 'var(--danger)' }}>Cancelled</span>
                        )}
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
