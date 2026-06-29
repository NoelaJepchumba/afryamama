'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { addDoc, collection, getDocs, limit, query, where, firebaseDb } from '@/lib/firebaseClient';

type DocSnapshotLike = {
  id: string;
  data(): Record<string, unknown>;
};

interface DashboardMetrics {
  activeMothers: number;
  todaysAppointments: number;
  infantsMonitored: number;
}

interface AppointmentRow {
  id: string;
  motherName: string;
  contact: string;
  appointmentTime: string;
  consultationFor: 'MOTHER' | 'CHILD';
  reason: string;
  status: string;
  recordLink: string;
}

interface MotherOption {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  stage: 'PRENATAL' | 'POSTNATAL';
  pregnancyWeek: number | null;
  babyAgeMonths: number | null;
}

const emptyMetrics: DashboardMetrics = {
  activeMothers: 0,
  todaysAppointments: 0,
  infantsMonitored: 0,
};

function toTimeLabel(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    if (value.includes(':')) {
      return value;
    }
  }
  return '-';
}

function getStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'pending') return 'badge-warning';
  if (normalized === 'cancelled' || normalized === 'rejected') return 'badge-danger';
  return 'badge-success';
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doctorName, setDoctorName] = useState('Doctor');
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [doctorDocId, setDoctorDocId] = useState('');
  const [motherOptions, setMotherOptions] = useState<MotherOption[]>([]);
  const [selectedMotherId, setSelectedMotherId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [appointmentReason, setAppointmentReason] = useState('Routine clinic review');
  const [appointmentStage, setAppointmentStage] = useState<'PRENATAL' | 'POSTNATAL'>('PRENATAL');
  const [creating, setCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const selectedMother = useMemo(
    () => motherOptions.find((item) => item.id === selectedMotherId) || null,
    [motherOptions, selectedMotherId]
  );


  async function createSingleAppointment() {
    if (!user?.email || !selectedMother) {
      setActionMessage('Select a mother first.');
      return;
    }

    if (!appointmentDate.trim()) {
      setActionMessage('Choose appointment date.');
      return;
    }

    setCreating(true);
    setActionMessage('');

    try {
      const dateTimeIso = new Date(`${appointmentDate}T${appointmentTime || '09:00'}:00`).toISOString();
      await addDoc(collection(firebaseDb, 'appointments'), {
        motherId: selectedMother.id,
        motherName: selectedMother.fullName,
        motherEmail: selectedMother.email,
        motherPhone: selectedMother.phone,
        doctorId: doctorDocId || user.uid,
        doctorUid: user.uid,
        doctorEmail: user.email,
        doctorName,
        stage: appointmentStage,
        reason: appointmentReason || 'Routine clinic review',
        status: 'PENDING',
        dateTime: dateTimeIso,
        appointmentDate: dateTimeIso,
        appointmentTime: appointmentTime || '09:00',
        createdAt: new Date().toISOString(),
        source: 'DOCTOR_MANUAL',
      });

      setActionMessage('Appointment created successfully.');
    } catch {
      setActionMessage('Could not create appointment.');
    } finally {
      setCreating(false);
    }
  }


  useEffect(() => {
    async function loadDashboardData() {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        const [doctorsSnapshot, doctorsCapsSnapshot] = await Promise.all([
          getDocs(query(collection(firebaseDb, 'doctors'), where('email', '==', user.email), limit(1))),
          getDocs(query(collection(firebaseDb, 'Doctors'), where('email', '==', user.email), limit(1))),
        ]);

        let resolvedDoctorDoc = !doctorsSnapshot.empty
          ? doctorsSnapshot.docs[0]
          : !doctorsCapsSnapshot.empty
            ? doctorsCapsSnapshot.docs[0]
            : null;

        if (!resolvedDoctorDoc) {
          const normalizedUserEmail = user.email.trim().toLowerCase();
          const [allDoctorsSnapshot, allDoctorsCapsSnapshot] = await Promise.all([
            getDocs(collection(firebaseDb, 'doctors')),
            getDocs(collection(firebaseDb, 'Doctors')),
          ]);

          const allDoctorDocs = [...allDoctorsSnapshot.docs, ...allDoctorsCapsSnapshot.docs];
          resolvedDoctorDoc =
            allDoctorDocs.find((docItem: DocSnapshotLike) => {
              const data = docItem.data() as Record<string, unknown>;
              const candidateEmail =
                (data.email || data.Email || data.userEmail || data.user_email || '').toString().trim().toLowerCase();
              return candidateEmail && candidateEmail === normalizedUserEmail;
            }) || null;
        }

        const resolvedDoctorData = (resolvedDoctorDoc?.data() as Record<string, unknown> | undefined) || {};

        const resolvedDoctorName = (() => {
          if (!resolvedDoctorDoc) return (user.displayName || user.email || 'Doctor').toString();
          const doctorData = resolvedDoctorData;
          const firstName = (doctorData.firstName || doctorData.first_name || '').toString().trim();
          const lastName = (doctorData.lastName || doctorData.last_name || '').toString().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          setDoctorName(fullName || user.email || 'Doctor');
        } else {
          setDoctorName(user.email || 'Doctor');
        }

        if (resolvedDoctorDoc) {
          setDoctorDocId(resolvedDoctorDoc.id);
        }
        setDoctorName(resolvedDoctorName);

        const resolvedDoctorDocId = resolvedDoctorDoc?.id || '';
        const resolvedDoctorNameKey = normalizeDoctorName(resolvedDoctorName);
        const assignedMotherEmails = [
          ...toStringArray(resolvedDoctorData.assignedMotherEmails),
          ...toStringArray(resolvedDoctorData.assigned_mother_emails),
          ...toStringArray(resolvedDoctorData.motherEmails),
          ...toStringArray(resolvedDoctorData.mother_emails),
        ].map((value) => value.toLowerCase());
        const assignedMotherIds = [
          ...toStringArray(resolvedDoctorData.assignedMotherIds),
          ...toStringArray(resolvedDoctorData.assigned_mother_ids),
          ...toStringArray(resolvedDoctorData.motherIds),
          ...toStringArray(resolvedDoctorData.mother_ids),
        ];

        const [mothersSnapshot, childrenSnapshot, allAppointmentsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'children')),
          getDocs(collection(firebaseDb, 'appointments')),
        ]);

        const motherPhoneById = new Map<string, string>();
        const prenatalMotherIds = new Set<string>();
        mothersSnapshot.docs.forEach((docItem: DocSnapshotLike) => {
          const data = docItem.data() as Record<string, unknown>;
          const phone = (data.phone || data.contact || data.phoneNumber || '').toString().trim();
          if (phone) {
            motherPhoneById.set(docItem.id, phone);
          }

          const status = (data.status || data.maternalStatus || data.stage || '').toString().trim().toUpperCase();
          if (status.includes('PRENATAL') || status.includes('PREG')) {
            prenatalMotherIds.add(docItem.id);
          }
        });

        const pregnancyMotherIds = new Set<string>();
        pregnanciesSnapshot.docs.forEach((docItem: DocSnapshotLike) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = (data.motherId || data.mother_id || '').toString().trim();
          const status = (data.status || '').toString().trim().toUpperCase();
          if (!motherId) return;
          if (!status || status === 'ACTIVE' || status === 'ONGOING' || status === 'PREGNANT') {
            pregnancyMotherIds.add(motherId);
          }
        });

        const activePregnancyCount = new Set<string>([
          ...pregnancyMotherIds,
          ...prenatalMotherIds,
        ]).size;

        const today = new Date();
        const todayKey = today.toISOString().slice(0, 10);

        const doctorAppointments = allAppointmentsSnapshot.docs.filter((docItem: DocSnapshotLike) => {
          const data = docItem.data() as Record<string, unknown>;
          const candidateEmails = [
            data.doctorEmail,
            data.doctor_email,
            data.primaryDoctorEmail,
            data.primary_doctor_email,
            data.email,
          ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim().toLowerCase());

          const candidateDoctorIds = [
            data.doctorId,
            data.doctorUid,
            data.doctor_uid,
            data.primaryDoctorId,
            data.primaryDoctorUid,
            data.primary_doctor_id,
            data.primary_doctor_uid,
          ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim());

          const candidateDoctorNames = [
            data.doctorName,
            data.doctor_name,
            data.primaryDoctorName,
            data.primary_doctor_name,
            data.assignedDoctorName,
            data.assigned_doctor_name,
          ]
            .map((value) => normalizeDoctorName(value))
            .filter((value) => Boolean(value));

          const candidateMotherEmails = [
            data.motherEmail,
            data.email,
            data.userEmail,
            data.patientEmail,
          ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim().toLowerCase());

          const candidateMotherIds = [
            data.motherId,
            data.mother_id,
            data.patientId,
            data.patient_id,
          ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim());

          return (
            candidateEmails.includes(user.email!.trim().toLowerCase()) ||
            candidateDoctorIds.includes(user.uid) ||
            (resolvedDoctorDocId ? candidateDoctorIds.includes(resolvedDoctorDocId) : false) ||
            (resolvedDoctorNameKey ? candidateDoctorNames.includes(resolvedDoctorNameKey) : false) ||
            candidateMotherEmails.some((value) => allAssignedMotherEmails.has(value)) ||
            candidateMotherIds.some((value) => allAssignedMotherIds.has(value))
          );
        });

        const todaysDoctorAppointments = doctorAppointments.filter((docItem: DocSnapshotLike) => {
          const data = docItem.data() as Record<string, unknown>;
          return isTodayAppointment(data.dateTime || data.appointmentDate || data.date || data.scheduledAt || data.appointmentTime);
        });

        const todaysAppointments = todaysDoctorAppointments.length;

        const rows: AppointmentRow[] = todaysDoctorAppointments.slice(0, 8).map((docItem: DocSnapshotLike) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = (data.motherFirstName || data.firstName || '').toString().trim();
          const lastName = (data.motherLastName || data.lastName || '').toString().trim();
          const motherName =
            `${firstName} ${lastName}`.trim() ||
            (data.motherName || data.patientName || data.name || 'Mother').toString();
          const motherId = (data.motherId || data.mother_id || '').toString().trim();
          const childId = (data.childId || data.child_id || '').toString().trim();
          const consultationFor = inferAppointmentFor(data);

          return {
            id: docItem.id,
            motherName,
            contact: motherPhoneById.get(motherId) || (data.phone || data.contact || data.motherPhone || '-').toString(),
            appointmentTime: toTimeLabel(data.dateTime || data.appointmentTime || data.date),
            consultationFor,
            reason: (data.reason || data.notes || 'Consultation').toString(),
            status: (data.status || 'Pending').toString(),
            recordLink:
              consultationFor === 'CHILD'
                ? motherId
                  ? `/records/child/${motherId}`
                  : childId
                    ? `/records/child/${childId}`
                    : '/records'
                : motherId
                  ? `/records/mother/${motherId}`
                  : '/records',
          };
        });

        setMetrics({
          activeMothers: mappedMothers.length,
          activeMothers: mothersSnapshot.size,
          activePregnancies: activePregnancyCount,
          todaysAppointments,
          infantsMonitored: childrenSnapshot.size,
        });
        setAppointments(rows);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [user?.email, user?.uid]);

  const welcomeName = useMemo(() => {
    if (!doctorName) return 'Doctor';
    return doctorName;
  }, [doctorName]);

  const filteredAppointments = useMemo(() => {
    const nameTerm = nameFilter.trim().toLowerCase();
    const contactTerm = contactFilter.trim().toLowerCase();
    const timeTerm = timeFilter.trim().toLowerCase();
    const reasonTerm = reasonFilter.trim().toLowerCase();
    const statusTerm = statusFilter.trim().toLowerCase();

    if (!nameTerm && !contactTerm && !timeTerm && !reasonTerm && !statusTerm) return appointments;

    return appointments.filter((item) => {
      const nameMatches = !nameTerm || item.motherName.toLowerCase().includes(nameTerm);
      const contactMatches = !contactTerm || item.contact.toLowerCase().includes(contactTerm);
      const timeMatches = !timeTerm || item.appointmentTime.toLowerCase().includes(timeTerm);
      const reasonMatches = !reasonTerm || item.reason.toLowerCase().includes(reasonTerm);
      const statusMatches = !statusTerm || item.status.toLowerCase().includes(statusTerm);
      return nameMatches && contactMatches && timeMatches && reasonMatches && statusMatches;
    });
  }, [appointments, nameFilter, contactFilter, timeFilter, reasonFilter, statusFilter]);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Clinician Dashboard</h1>
            <p className="page-subtitle">Welcome back, Dr. {welcomeName}. Here is your clinic overview for today.</p>
          </div>
        </div>

        <div className="card-grid">
          <div className="stat-card">
            <span className="stat-title">Active Mothers</span>
            <div className="stat-value">{loading ? '...' : metrics.activeMothers.toLocaleString()}</div>
            <span className="stat-desc">
              Mothers loaded from Firestore
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-title">Today's Appointments</span>
            <div className="stat-value">{loading ? '...' : metrics.todaysAppointments.toLocaleString()}</div>
            <span className="stat-desc">
              For your account today
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-title">Infants Monitored</span>
            <div className="stat-value">{loading ? '...' : metrics.infantsMonitored.toLocaleString()}</div>
            <span className="stat-desc">
              Children loaded from Firestore
            </span>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>Create Appointments (Doctor Side)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label>
              <div className="text-muted">Mother</div>
              <select
                className="table-filter-input"
                value={selectedMotherId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedMotherId(nextId);
                  const nextMother = motherOptions.find((item) => item.id === nextId);
                  if (nextMother) {
                    setAppointmentStage(nextMother.stage);
                  }
                }}
              >
                {motherOptions.map((mother) => (
                  <option key={mother.id} value={mother.id}>
                    {mother.fullName} ({mother.stage})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="text-muted">Stage</div>
              <select
                className="table-filter-input"
                value={appointmentStage}
                onChange={(event) => setAppointmentStage(event.target.value as 'PRENATAL' | 'POSTNATAL')}
              >
                <option value="PRENATAL">Prenatal</option>
                <option value="POSTNATAL">Postnatal</option>
              </select>
            </label>

            <label>
              <div className="text-muted">Date</div>
              <input className="table-filter-input" type="date" value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} />
            </label>

            <label>
              <div className="text-muted">Time</div>
              <input className="table-filter-input" type="time" value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <div className="text-muted">Reason</div>
              <input className="table-filter-input" value={appointmentReason} onChange={(event) => setAppointmentReason(event.target.value)} placeholder="Reason for appointment" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-compact" onClick={createSingleAppointment} disabled={creating || !selectedMotherId}>
              {creating ? 'Creating...' : 'Create Appointment'}
            </button>
          </div>

          {selectedMother ? (
            <p className="page-subtitle" style={{ marginBottom: 10 }}>
              {selectedMother.stage === 'POSTNATAL'
                ? `Postnatal schedule will use baby age (${selectedMother.babyAgeMonths ?? 0} months) to generate appointments.`
                : `Prenatal schedule will use pregnancy week (${selectedMother.pregnancyWeek ?? 0}) to generate appointments.`}
            </p>
          ) : null}

          {actionMessage ? <p className="page-subtitle" style={{ marginBottom: 12 }}>{actionMessage}</p> : null}
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>Upcoming Clinical Consultations</span>
            <button className="btn btn-secondary btn-compact">View All</button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mother Name</th>
                  <th>Contact</th>
                  <th>Appointment Time</th>
                  <th>For</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
                <tr className="table-filter-row">
                  <th>
                    <input id="doctor-filter-name" className="table-filter-input" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Search name" />
                  </th>
                  <th>
                    <input id="doctor-filter-contact" className="table-filter-input" value={contactFilter} onChange={(event) => setContactFilter(event.target.value)} placeholder="Contact" />
                  </th>
                  <th>
                    <input id="doctor-filter-time" className="table-filter-input" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)} placeholder="Time" />
                  </th>
                  <th />
                  <th>
                    <input id="doctor-filter-reason" className="table-filter-input" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} placeholder="Reason" />
                  </th>
                  <th>
                    <input id="doctor-filter-status" className="table-filter-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="Status" />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading appointments from Firestore...</td>
                  </tr>
                ) : filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No appointments found for the selected filter.</td>
                  </tr>
                ) : (
                  filteredAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>{appointment.motherName}</td>
                      <td>{appointment.contact}</td>
                      <td>{appointment.appointmentTime}</td>
                      <td>
                        <span className={`badge ${appointment.consultationFor === 'CHILD' ? 'badge-warning' : 'badge-success'}`}>
                          {appointment.consultationFor}
                        </span>
                      </td>
                      <td>{appointment.reason}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(appointment.status)}`}>
                          {appointment.status}
                        </span>
                      </td>
                      <td>
                        <Link href={appointment.recordLink} className="btn btn-primary btn-compact">
                          Open File
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
