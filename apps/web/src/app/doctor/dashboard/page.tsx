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

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value: unknown): string {
  return normalize(value).toLowerCase();
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

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

function inferAppointmentFor(data: Record<string, unknown>): 'MOTHER' | 'CHILD' {
  const source = normalizeLower(data.consultationFor || data.consultation_for || data.recordType || data.record_type);
  if (source.includes('child') || source.includes('baby') || source.includes('growth')) {
    return 'CHILD';
  }
  return 'MOTHER';
}

function isTodayAppointment(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item));
}

function normalizeDoctorName(value: unknown): string {
  return normalizeLower(value).replace(/\s+/g, ' ');
}

function motherNameFromData(data: Record<string, unknown>): string {
  const firstName = normalize(data.firstName || data.first_name || data.motherFirstName || data.mother_first_name);
  const lastName = normalize(data.lastName || data.last_name || data.motherLastName || data.mother_last_name);
  const combined = `${firstName} ${lastName}`.trim();
  return combined || normalize(data.fullName || data.full_name || data.name) || 'Mother';
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
        consultationFor: appointmentStage === 'POSTNATAL' ? 'CHILD' : 'MOTHER',
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

        let resolvedDoctorDoc: DocSnapshotLike | null = !doctorsSnapshot.empty
          ? (doctorsSnapshot.docs[0] as unknown as DocSnapshotLike)
          : !doctorsCapsSnapshot.empty
            ? (doctorsCapsSnapshot.docs[0] as unknown as DocSnapshotLike)
            : null;

        if (!resolvedDoctorDoc) {
          const normalizedUserEmail = normalizeLower(user.email);
          const [allDoctorsSnapshot, allDoctorsCapsSnapshot] = await Promise.all([
            getDocs(collection(firebaseDb, 'doctors')),
            getDocs(collection(firebaseDb, 'Doctors')),
          ]);

          const allDoctorDocs = [...allDoctorsSnapshot.docs, ...allDoctorsCapsSnapshot.docs] as unknown as DocSnapshotLike[];
          resolvedDoctorDoc =
            allDoctorDocs.find((docItem) => {
              const data = docItem.data() as Record<string, unknown>;
              const candidateEmail = normalizeLower(data.email || data.Email || data.userEmail || data.user_email);
              return candidateEmail && candidateEmail === normalizedUserEmail;
            }) || null;
        }

        const resolvedDoctorData = (resolvedDoctorDoc?.data() as Record<string, unknown> | undefined) || {};

        const resolvedDoctorName = (() => {
          if (!resolvedDoctorDoc) return (user.displayName || user.email || 'Doctor').toString();
          const firstName = normalize(resolvedDoctorData.firstName || resolvedDoctorData.first_name);
          const lastName = normalize(resolvedDoctorData.lastName || resolvedDoctorData.last_name);
          const fullName = `${firstName} ${lastName}`.trim();
          return fullName || normalize(resolvedDoctorData.fullName || resolvedDoctorData.name) || user.email || 'Doctor';
        })();

        if (resolvedDoctorDoc) {
          setDoctorDocId(resolvedDoctorDoc.id);
        }
        setDoctorName(resolvedDoctorName);

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

        const allAssignedMotherEmails = new Set(assignedMotherEmails);
        const allAssignedMotherIds = new Set(assignedMotherIds);

        const [mothersSnapshot, mothersCapsSnapshot, childrenSnapshot, allAppointmentsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'Mothers')),
          getDocs(collection(firebaseDb, 'children')),
          getDocs(collection(firebaseDb, 'appointments')),
        ]);

        const allMotherDocs = [...mothersSnapshot.docs, ...mothersCapsSnapshot.docs] as unknown as DocSnapshotLike[];
        const mappedMotherByKey = new Map<string, MotherOption>();

        allMotherDocs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const email = normalizeLower(data.email || data.Email || data.userEmail || data.user_email);
          const fullName = motherNameFromData(data);
          const stageText = normalizeLower(data.stage || data.motherStage || data.status || data.maternalStatus);
          const stage: 'PRENATAL' | 'POSTNATAL' = stageText.includes('post') ? 'POSTNATAL' : 'PRENATAL';

          const option: MotherOption = {
            id: docItem.id,
            fullName,
            email,
            phone: normalize(data.phone || data.contact || data.phoneNumber),
            stage,
            pregnancyWeek: toNumberOrNull(data.pregnancyWeek || data.week || data.currentWeek),
            babyAgeMonths: toNumberOrNull(data.babyAgeMonths || data.baby_months || data.infantAgeMonths),
          };

          const key = email || docItem.id;
          if (!mappedMotherByKey.has(key)) {
            mappedMotherByKey.set(key, option);
          }
        });

        const allMappedMothers = Array.from(mappedMotherByKey.values()).sort((a, b) =>
          a.fullName.localeCompare(b.fullName)
        );

        const assignedOnly = allMappedMothers.filter((mother) =>
          allAssignedMotherIds.has(mother.id) || (mother.email && allAssignedMotherEmails.has(mother.email))
        );

        // If assigned links are present and match mothers, show assigned list.
        // Otherwise show all mothers so appointment creation never gets blocked.
        const visibleMothers = assignedOnly.length > 0 ? assignedOnly : allMappedMothers;

        setMotherOptions(visibleMothers);
        if (visibleMothers.length > 0) {
          const first = visibleMothers[0];
          setSelectedMotherId((current) => current || first.id);
          setAppointmentStage(first.stage);
        } else {
          setSelectedMotherId('');
        }

        const resolvedDoctorDocId = resolvedDoctorDoc?.id || '';
        const resolvedDoctorNameKey = normalizeDoctorName(resolvedDoctorName);

        const doctorAppointments = (allAppointmentsSnapshot.docs as unknown as DocSnapshotLike[]).filter((docItem) => {
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
            candidateEmails.includes(normalizeLower(user.email)) ||
            candidateDoctorIds.includes(user.uid) ||
            (resolvedDoctorDocId ? candidateDoctorIds.includes(resolvedDoctorDocId) : false) ||
            (resolvedDoctorNameKey ? candidateDoctorNames.includes(resolvedDoctorNameKey) : false) ||
            candidateMotherEmails.some((value) => allAssignedMotherEmails.has(value)) ||
            candidateMotherIds.some((value) => allAssignedMotherIds.has(value))
          );
        });

        const todaysDoctorAppointments = doctorAppointments.filter((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          return isTodayAppointment(data.dateTime || data.appointmentDate || data.date || data.scheduledAt);
        });

        const rows: AppointmentRow[] = todaysDoctorAppointments.slice(0, 8).map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherName =
            normalize(data.motherName || data.patientName || data.name) ||
            motherNameFromData(data);
          const motherId = normalize(data.motherId || data.mother_id);
          const childId = normalize(data.childId || data.child_id);
          const consultationFor = inferAppointmentFor(data);

          return {
            id: docItem.id,
            motherName,
            contact: normalize(data.phone || data.contact || data.motherPhone) || '-',
            appointmentTime: toTimeLabel(data.dateTime || data.appointmentTime || data.date),
            consultationFor,
            reason: normalize(data.reason || data.notes) || 'Consultation',
            status: normalize(data.status) || 'Pending',
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
          activeMothers: visibleMothers.length,
          todaysAppointments: todaysDoctorAppointments.length,
          infantsMonitored: childrenSnapshot.size,
        });

        setAppointments(rows);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [user?.email, user?.uid, user?.displayName]);

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
          <span className="stat-desc">Mothers available for appointment booking</span>
        </div>

        <div className="stat-card">
          <span className="stat-title">Today's Appointments</span>
          <div className="stat-value">{loading ? '...' : metrics.todaysAppointments.toLocaleString()}</div>
          <span className="stat-desc">For your account today</span>
        </div>

        <div className="stat-card">
          <span className="stat-title">Infants Monitored</span>
          <div className="stat-value">{loading ? '...' : metrics.infantsMonitored.toLocaleString()}</div>
          <span className="stat-desc">Children loaded from Firestore</span>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Create Appointments</span>
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
              <option value="">Select mother</option>
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
              ? `Postnatal schedule selected (${selectedMother.babyAgeMonths ?? 0} months baby age).`
              : `Prenatal schedule selected (${selectedMother.pregnancyWeek ?? 0} weeks pregnant).`}
          </p>
        ) : null}

        {!loading && motherOptions.length === 0 ? (
          <p className="page-subtitle" style={{ marginBottom: 10 }}>
            No mothers found. Confirm that mother profiles exist in Firestore under mothers/Mothers collections.
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
                  <td colSpan={7}>Loading appointments from Firestore...</td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7}>No appointments found for the selected filter.</td>
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
