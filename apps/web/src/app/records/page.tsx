'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

interface MaternalRow {
  id: string;
  motherId: string;
  careType: string;
  patient: string;
  pregnancyTerm: string;
  checkupDate: string;
  weight: string;
  bp: string;
  fhr: string;
  notes: string;
}

interface ChildRow {
  id: string;
  childName: string;
  mother: string;
  dob: string;
  weight: string;
  height: string;
  recentVaccine: string;
  vaccineStatus: string;
}

function asLabel(value: unknown, fallback = '-'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function asDateLabel(value: unknown): string {
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
    return value;
  }
  return '-';
}

function inferMaternalType(data: Record<string, unknown>): string {
  const raw = asLabel(data.type ?? data.appointmentType ?? data.visitType ?? data.recordType, 'ANC').toUpperCase();
  if (raw.includes('PNC') || raw.includes('POSTNATAL')) return 'PNC';
  return 'ANC';
}

export default function RecordsPage() {
  const [activeTab, setActiveTab] = useState<'maternal' | 'child'>('maternal');
  const [loading, setLoading] = useState(true);
  const [maternalRows, setMaternalRows] = useState<MaternalRow[]>([]);
  const [childRows, setChildRows] = useState<ChildRow[]>([]);
  const ancRows = maternalRows.filter((row) => row.careType === 'ANC');
  const pncRows = maternalRows.filter((row) => row.careType === 'PNC');

  useEffect(() => {
    let isMounted = true;

    async function loadRecords() {
      try {
        const [mothersSnapshot, pregnanciesSnapshot, maternalSnapshot, appointmentsSnapshot, childrenSnapshot, growthSnapshot, immunizationSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'mothers')),
            getDocs(collection(firebaseDb, 'pregnancies')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'appointments')),
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'growthRecords')),
            getDocs(collection(firebaseDb, 'immunizations')),
          ]);

        const mothersById = new Map<string, string>();
        mothersSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = asLabel(data.firstName ?? data.first_name, '');
          const lastName = asLabel(data.lastName ?? data.last_name, '');
          const fullName = `${firstName} ${lastName}`.trim();
          mothersById.set(docItem.id, fullName || asLabel(data.full_name ?? data.name, 'Unknown Mother'));
        });

        const pregnanciesByMotherId = new Map<string, Record<string, unknown>>();
        pregnanciesSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          if (motherId) pregnanciesByMotherId.set(motherId, data);
        });

        const maternal: MaternalRow[] = maternalSnapshot.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          const pregnancy = pregnanciesByMotherId.get(motherId);
          const gestation = asLabel(data.gestationWeeks ?? data.gestation, '-');
          const pregnancyStatus = asLabel(pregnancy?.status, 'Active');

          return {
            id: docItem.id,
            motherId,
            careType: inferMaternalType(data),
            patient: mothersById.get(motherId) || asLabel(data.motherName ?? data.patientName, 'Unknown Mother'),
            pregnancyTerm: gestation === '-' ? pregnancyStatus : `${gestation} Weeks (${pregnancyStatus})`,
            checkupDate: asDateLabel(data.checkupDate ?? data.visitDate ?? data.date ?? data.recordedDate),
            weight: asLabel(data.weight, '-'),
            bp: asLabel(data.bloodPressure ?? data.bp, '-'),
            fhr: (() => {
              const raw = data.fetalHeartRate ?? data.fhr;
              if (typeof raw === 'number') return `${raw} bpm`;
              const txt = asLabel(raw, '-');
              return txt === '-' ? txt : txt.includes('bpm') ? txt : `${txt} bpm`;
            })(),
            notes: asLabel(data.clinicalObservations ?? data.notes ?? data.plan, 'No clinical notes.'),
          };
        });

        const maternalFromAppointments: MaternalRow[] = appointmentsSnapshot.docs
          .map((docItem) => {
            const data = docItem.data() as Record<string, unknown>;
            return { id: docItem.id, data };
          })
          .filter(({ data }) => {
            const type = inferMaternalType(data);
            return type === 'ANC' || type === 'PNC';
          })
          .map(({ id, data }) => {
            const motherId = asLabel(data.motherId ?? data.mother_id, '');
            const pregnancy = pregnanciesByMotherId.get(motherId);
            const gestation = asLabel(data.gestationWeeks ?? data.gestation, '-');
            const pregnancyStatus = asLabel(pregnancy?.status, 'Active');

            return {
              id,
              motherId,
              careType: inferMaternalType(data),
              patient: mothersById.get(motherId) || asLabel(data.motherName ?? data.patientName, 'Unknown Mother'),
              pregnancyTerm: gestation === '-' ? pregnancyStatus : `${gestation} Weeks (${pregnancyStatus})`,
              checkupDate: asDateLabel(data.dateTime ?? data.date ?? data.appointmentTime ?? data.createdAt),
              weight: asLabel(data.weight, '-'),
              bp: asLabel(data.bloodPressure ?? data.bp, '-'),
              fhr: (() => {
                const raw = data.fetalHeartRate ?? data.fhr;
                if (typeof raw === 'number') return `${raw} bpm`;
                const txt = asLabel(raw, '-');
                return txt === '-' ? txt : txt.includes('bpm') ? txt : `${txt} bpm`;
              })(),
              notes: asLabel(data.clinicalObservations ?? data.notes ?? data.reason ?? data.plan, 'No clinical notes.'),
            };
          });

        const maternalById = new Map<string, MaternalRow>();
        [...maternal, ...maternalFromAppointments].forEach((row) => {
          if (!maternalById.has(row.id)) maternalById.set(row.id, row);
        });

        const combinedMaternal = Array.from(maternalById.values()).sort((a, b) => b.checkupDate.localeCompare(a.checkupDate));

        const growthByChildId = new Map<string, Record<string, unknown>>();
        growthSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const childId = asLabel(data.childId ?? data.child_id, '');
          if (!childId || growthByChildId.has(childId)) return;
          growthByChildId.set(childId, data);
        });

        const immunizationByChildId = new Map<string, Record<string, unknown>>();
        immunizationSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const childId = asLabel(data.childId ?? data.child_id, '');
          if (!childId || immunizationByChildId.has(childId)) return;
          immunizationByChildId.set(childId, data);
        });

        const child: ChildRow[] = childrenSnapshot.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          const growth = growthByChildId.get(docItem.id);
          const immunization = immunizationByChildId.get(docItem.id);

          return {
            id: docItem.id,
            childName: asLabel(data.name ?? data.childName, 'Unknown Child'),
            mother: mothersById.get(motherId) || asLabel(data.motherName, '-'),
            dob: asDateLabel(data.dateOfBirth ?? data.dob),
            weight: asLabel(growth?.weight ?? data.weight, '-'),
            height: asLabel(growth?.height ?? data.height, '-'),
            recentVaccine: asLabel(immunization?.vaccine ?? immunization?.vaccineName, '-'),
            vaccineStatus: asLabel(immunization?.status, 'Due'),
          };
        });

        if (isMounted) {
          setMaternalRows(combinedMaternal);
          setChildRows(child);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Medical Records</h1>
            <p className="page-subtitle">Track pregnancy progressions, child development indices, and vaccine status.</p>
          </div>
          <div>
            <button className="btn btn-primary">+ Add New Record</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button 
            className={`btn ${activeTab === 'maternal' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('maternal')}
          >
            Maternal Health Records
          </button>
          <button 
            className={`btn ${activeTab === 'child' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('child')}
          >
            Child Development & Vaccines
          </button>
        </div>

        {activeTab === 'maternal' ? (
          <>
            <div className="content-card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <span>Antenatal Care (ANC) Progress Records</span>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Pregnancy Term</th>
                      <th>Checkup Date</th>
                      <th>Weight (kg)</th>
                      <th>BP</th>
                      <th>Fetal Heart Rate</th>
                      <th>Clinical Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7}>Loading ANC records from Firestore...</td>
                      </tr>
                    ) : ancRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No ANC records found.</td>
                      </tr>
                    ) : (
                      ancRows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: '600' }}>{row.patient}</td>
                          <td>{row.pregnancyTerm}</td>
                          <td>{row.checkupDate}</td>
                          <td>{row.weight}</td>
                          <td>{row.bp}</td>
                          <td>{row.fhr}</td>
                          <td>{row.notes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="content-card">
              <div className="card-header">
                <span>Postnatal Care (PNC) Progress Records</span>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Pregnancy Term</th>
                      <th>Checkup Date</th>
                      <th>Weight (kg)</th>
                      <th>BP</th>
                      <th>Clinical Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6}>Loading PNC records from Firestore...</td>
                      </tr>
                    ) : pncRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No PNC records found.</td>
                      </tr>
                    ) : (
                      pncRows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: '600' }}>{row.patient}</td>
                          <td>{row.pregnancyTerm}</td>
                          <td>{row.checkupDate}</td>
                          <td>{row.weight}</td>
                          <td>{row.bp}</td>
                          <td>{row.notes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="content-card">
            <div className="card-header">
              <span>Pediatric Growth & Immunization Records</span>
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Child Name</th>
                    <th>Mother</th>
                    <th>Date of Birth</th>
                    <th>Weight (kg)</th>
                    <th>Height (cm)</th>
                    <th>Recent Vaccine</th>
                    <th>Vaccine Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7}>Loading child records from Firestore...</td>
                    </tr>
                  ) : childRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No child records found.</td>
                    </tr>
                  ) : (
                    childRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: '600' }}>{row.childName}</td>
                        <td>{row.mother}</td>
                        <td>{row.dob}</td>
                        <td>{row.weight}</td>
                        <td>{row.height}</td>
                        <td>{row.recentVaccine}</td>
                        <td>
                          <span className={`badge ${row.vaccineStatus.toLowerCase() === 'completed' || row.vaccineStatus.toLowerCase() === 'done' ? 'badge-success' : row.vaccineStatus.toLowerCase() === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>
                            {row.vaccineStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </main>
  );
}
