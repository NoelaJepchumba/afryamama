'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { addDoc, collection, doc, getDocs, limit, query, updateDoc, where, firebaseDb } from '@/lib/firebaseClient';

type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

interface AppointmentRow {
  id: string;
  motherId: string;
  childId: string;
  consultationFor: 'MOTHER' | 'CHILD';
  name: string;
  reason: string;
  time: string;
  status: AppointmentStatus;
  stage: 'PRENATAL' | 'POSTNATAL';
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

function mapMotherDocToOption(docId: string, data: Record<string, unknown>): MotherOption {
  const firstName = (data.firstName || data.first_name || '').toString().trim();
  const lastName = (data.lastName || data.last_name || '').toString().trim();
  const fullName = `${firstName} ${lastName}`.trim() || (data.fullName || data.name || data.motherName || 'Mother').toString();
  const stageRaw = (data.stage || data.motherStage || 'PRENATAL').toString().toUpperCase();
  const stage: 'PRENATAL' | 'POSTNATAL' = stageRaw === 'POSTNATAL' ? 'POSTNATAL' : 'PRENATAL';
  const pregnancyWeek = Number.parseInt((data.pregnancyWeek || data.week || '').toString(), 10);
  const babyAgeMonths = Number.parseInt((data.babyAgeMonths || data.infantAgeMonths || '').toString(), 10);

  return {
    id: docId,
    fullName,
    email: (data.email || data.Email || data.userEmail || '').toString(),
    phone: (data.phone || data.phoneNumber || data.contact || '-').toString(),
    stage,
    pregnancyWeek: Number.isNaN(pregnancyWeek) ? null : pregnancyWeek,
    babyAgeMonths: Number.isNaN(babyAgeMonths) ? null : babyAgeMonths,
  };
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

function normalizeDoctorName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => Boolean(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function isTodayAppointment(value: unknown): boolean {
  let parsed: Date | null = null;

  if (typeof value === 'string' && value.trim()) {
    const direct = new Date(value);
    parsed = Number.isNaN(direct.getTime()) ? null : direct;
  } else if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      const fromTimestamp = (value as { toDate: () => Date }).toDate();
      parsed = Number.isNaN(fromTimestamp.getTime()) ? null : fromTimestamp;
    } catch {
      parsed = null;
    }
  }

  if (!parsed) return false;

  const now = new Date();
  return parsed.toDateString() === now.toDateString();
}

function inferAppointmentFor(data: Record<string, unknown>): 'MOTHER' | 'CHILD' {
  const childId = (data.childId || data.child_id || '').toString().trim();
  const explicitType = (
    data.appointmentFor ||
    data.appointment_for ||
    data.patientType ||
    data.patient_type ||
    data.targetType ||
    data.target_type ||
    ''
  )
    .toString()
    .trim()
    .toUpperCase();

  if (explicitType.includes('CHILD') || explicitType.includes('BABY') || explicitType.includes('INFANT')) {
    return 'CHILD';
  }

  const reason = (data.reason || data.notes || data.appointmentType || data.type || '').toString().toLowerCase();
  const childKeywords = ['child', 'baby', 'infant', 'vaccine', 'immunization', 'growth', 'pediatric'];

  if (childId || childKeywords.some((keyword) => reason.includes(keyword))) {
    return 'CHILD';
  }

  return 'MOTHER';
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [doctorName, setDoctorName] = useState('Doctor');
  const [doctorDocId, setDoctorDocId] = useState('');
  const [motherOptions, setMotherOptions] = useState<MotherOption[]>([]);
  const [selectedMotherId, setSelectedMotherId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [appointmentReason, setAppointmentReason] = useState('Routine clinic review');
  const [appointmentStage, setAppointmentStage] = useState<'PRENATAL' | 'POSTNATAL'>('PRENATAL');
  const [creating, setCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const selectedMother = motherOptions.find((item) => item.id === selectedMotherId) || null;


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

  function getRecordVisitPath(appt: AppointmentRow): string {
    if (appt.consultationFor === 'CHILD') {
      return appt.motherId
        ? `/records/child/${appt.motherId}`
        : appt.childId
          ? `/records/child/${appt.childId}`
          : '/records';
    }

    const reason = appt.reason.toLowerCase();
    const likelyChildVisit =
      Boolean(appt.childId) ||
      reason.includes('child') ||
      reason.includes('vaccine') ||
      reason.includes('immunization') ||
      reason.includes('growth');

    if (likelyChildVisit) {
      return appt.childId ? `/records/child/${appt.childId}` : '/records';
    }

    if (appt.stage === 'POSTNATAL') {
      return appt.motherId ? `/records/mother/${appt.motherId}` : '/records';
    }

    return appt.motherId ? `/records/anc/${appt.motherId}` : '/records';
  }


  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        const [doctorsSnapshot, doctorsCapsSnapshot, appointmentsSnapshot, mothersSnapshot] = await Promise.all([
          getDocs(query(collection(firebaseDb, 'doctors'), where('email', '==', user.email), where('role', '==', 'DOCTOR'), where('active', '==', true), where('approved', '==', true), where('registrationStatus', '==', 'COMPLETE'), limit(1))),
          getDocs(query(collection(firebaseDb, 'Doctors'), where('email', '==', user.email), limit(1))),
          getDocs(collection(firebaseDb, 'appointments')),
          getDocs(collection(firebaseDb, 'mothers')),
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
            allDoctorDocs.find((docItem) => {
              const data = docItem.data() as Record<string, unknown>;
              const candidateEmail =
                (data.email || data.Email || data.userEmail || data.user_email || '').toString().trim().toLowerCase();
              return candidateEmail && candidateEmail === normalizedUserEmail;
            }) || null;
        }

        const resolvedDoctorData = (resolvedDoctorDoc?.data() as Record<string, unknown> | undefined) || {};

        const resolvedDoctorName = (() => {
          if (!resolvedDoctorDoc) return (user.displayName || 'Doctor').toString();
          const doctorData = resolvedDoctorData;
          const firstName = (doctorData.firstName || doctorData.first_name || '').toString().trim();
          const lastName = (doctorData.lastName || doctorData.last_name || '').toString().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          return fullName || (doctorData.name || doctorData.fullName || user.displayName || 'Doctor').toString();
        })();

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

        const motherNameById = new Map<string, string>();
        const allMotherDocs = [...mothersSnapshot.docs];

        const assignedMotherDocs = allMotherDocs.filter((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const assignedDoctorId = (data.assignedDoctorId || data.assigned_doctor_id || '').toString().trim();
          const assignedDoctorName = normalizeDoctorName(
            (data.assignedDoctorName || data.assigned_doctor_name || '').toString()
          );
          const assignedDoctorEmail =
            (data.assignedDoctorEmail || data.assigned_doctor_email || '').toString().trim().toLowerCase();

          return (
            (resolvedDoctorDocId && assignedDoctorId === resolvedDoctorDocId) ||
            assignedDoctorId === user.uid ||
            (resolvedDoctorNameKey && assignedDoctorName === resolvedDoctorNameKey) ||
            (assignedDoctorEmail && assignedDoctorEmail === user.email!.trim().toLowerCase())
          );
        });

        const motherDocsForOptions = assignedMotherDocs.length > 0 ? assignedMotherDocs : allMotherDocs;

        const derivedAssignedMotherEmails = new Set<string>();
        const derivedAssignedMotherIds = new Set<string>();

        allMotherDocs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const assignedDoctorId = (data.assignedDoctorId || data.assigned_doctor_id || '').toString().trim();
          const assignedDoctorName = normalizeDoctorName(
            (data.assignedDoctorName || data.assigned_doctor_name || '').toString()
          );
          const assignedDoctorEmail =
            (data.assignedDoctorEmail || data.assigned_doctor_email || '').toString().trim().toLowerCase();

          const doctorMatches =
            (resolvedDoctorDocId && assignedDoctorId === resolvedDoctorDocId) ||
            assignedDoctorId === user.uid ||
            (resolvedDoctorNameKey && assignedDoctorName === resolvedDoctorNameKey) ||
            (assignedDoctorEmail && assignedDoctorEmail === user.email!.trim().toLowerCase());

          if (!doctorMatches) return;

          const motherId = (data.id || docItem.id || '').toString().trim();
          const motherEmail = (data.email || data.Email || data.userEmail || '').toString().trim().toLowerCase();

          if (motherId) derivedAssignedMotherIds.add(motherId);
          if (motherEmail) derivedAssignedMotherEmails.add(motherEmail);
        });

        const allAssignedMotherEmails = new Set([
          ...assignedMotherEmails,
          ...Array.from(derivedAssignedMotherEmails),
        ]);
        const allAssignedMotherIds = new Set([
          ...assignedMotherIds,
          ...Array.from(derivedAssignedMotherIds),
        ]);

        const mappedMothers = motherDocsForOptions
          .map((docItem) => mapMotherDocToOption(docItem.id, docItem.data() as Record<string, unknown>))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        if (isMounted) {
          setMotherOptions(mappedMothers);
          if (mappedMothers.length > 0) {
            setSelectedMotherId((prev) => prev || mappedMothers[0].id);
            setAppointmentStage((prev) => {
              if (prev) return prev;
              return mappedMothers[0].stage;
            });
          }
        }

        allMotherDocs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = (data.firstName || data.first_name || '').toString().trim();
          const lastName = (data.lastName || data.last_name || '').toString().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          motherNameById.set(docItem.id, fullName || (data.full_name || data.name || 'Mother').toString());
        });

        const rows: AppointmentRow[] = appointmentsSnapshot.docs
          .filter((docItem) => {
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

            const dateValue =
              data.dateTime ||
              data.appointmentDate ||
              data.date ||
              data.scheduledAt ||
              data.appointmentTime;

            const isForToday = isTodayAppointment(dateValue);

            const matchesDoctor =
              candidateEmails.includes(user.email!.trim().toLowerCase()) ||
              candidateDoctorIds.includes(user.uid) ||
              (resolvedDoctorDocId ? candidateDoctorIds.includes(resolvedDoctorDocId) : false) ||
              (resolvedDoctorNameKey ? candidateDoctorNames.includes(resolvedDoctorNameKey) : false) ||
              candidateMotherEmails.some((value) => allAssignedMotherEmails.has(value)) ||
              candidateMotherIds.some((value) => allAssignedMotherIds.has(value));

            return matchesDoctor && isForToday;
          })
          .map((docItem) => {
            const data = docItem.data() as Record<string, unknown>;
            const motherId = (data.motherId || data.mother_id || '').toString();
            const childId = (data.childId || data.child_id || '').toString();
            const firstName = (data.motherFirstName || data.firstName || '').toString().trim();
            const lastName = (data.motherLastName || data.lastName || '').toString().trim();
            const inlineName = `${firstName} ${lastName}`.trim();

            return {
              id: docItem.id,
              motherId,
              childId,
              consultationFor: inferAppointmentFor(data),
              name:
                inlineName ||
                (data.motherName || data.patientName || '').toString() ||
                motherNameById.get(motherId) ||
                'Mother',
              reason: (data.reason || data.notes || data.appointmentType || 'Consultation').toString(),
              time: toDateTimeLabel(data.dateTime || data.appointmentTime || data.date),
              status: toStatus(data.status),
              stage: ((data.stage || data.appointmentStage || data.careStage || 'PRENATAL').toString().toUpperCase() === 'POSTNATAL' ? 'POSTNATAL' : 'PRENATAL'),
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
  }, [user?.email, user?.uid, user?.displayName]);

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
                  if (nextMother) setAppointmentStage(nextMother.stage);
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
              <select className="table-filter-input" value={appointmentStage} onChange={(event) => setAppointmentStage(event.target.value as 'PRENATAL' | 'POSTNATAL')}>
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
                ? `Postnatal schedule uses baby age (${selectedMother.babyAgeMonths ?? 0} months).`
                : `Prenatal schedule uses pregnancy week (${selectedMother.pregnancyWeek ?? 0}).`}
            </p>
          ) : null}

          {actionMessage ? <p className="page-subtitle" style={{ marginBottom: 12 }}>{actionMessage}</p> : null}
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
                  <th>For</th>
                  <th>Reason for Consultation</th>
                  <th>Scheduled Date & Time</th>
                  <th>Status</th>
                  <th>Control Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading appointments from Firestore...</td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No appointments found for this doctor.</td>
                  </tr>
                ) : (
                  appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td style={{ fontWeight: '600' }}>{appt.name}</td>
                      <td>
                        <span className={`badge ${appt.consultationFor === 'CHILD' ? 'badge-warning' : 'badge-success'}`}>
                          {appt.consultationFor}
                        </span>
                      </td>
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
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <Link
                            href={appt.motherId ? `/records/mother/${appt.motherId}` : '/records'}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            View Mother
                          </Link>

                          <Link
                            href={getRecordVisitPath(appt)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Record Visit
                          </Link>

                          {appt.status === 'PENDING' && (
                            <>
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
                            </>
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
                        </div>
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
