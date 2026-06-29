'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { addDoc, collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

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

interface MotherOption {
  id: string;
  name: string;
}

interface ChildOption {
  id: string;
  name: string;
  motherId: string;
  motherName: string;
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

function key(value: unknown): string {
  return asLabel(value, '').trim().toLowerCase();
}

function inferMaternalType(data: Record<string, unknown>): string {
  const raw = asLabel(data.type ?? data.appointmentType ?? data.visitType ?? data.recordType, 'ANC').toUpperCase();
  if (raw.includes('PNC') || raw.includes('POSTNATAL')) return 'PNC';
  return 'ANC';
}

function inferCareTypeWithStatus(data: Record<string, unknown>, motherStatus: string): string {
  const explicit = inferMaternalType(data);
  if (explicit === 'PNC') return 'PNC';

  const status = motherStatus.toUpperCase();
  if (status.includes('POSTNATAL') || status.includes('POST NATAL') || status.includes('PNC')) return 'PNC';
  return 'ANC';
}

export default function RecordsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'maternal' | 'child'>('maternal');
  const [loading, setLoading] = useState(true);
  const [maternalRows, setMaternalRows] = useState<MaternalRow[]>([]);
  const [childRows, setChildRows] = useState<ChildRow[]>([]);
  const [motherOptions, setMotherOptions] = useState<MotherOption[]>([]);
  const [childOptions, setChildOptions] = useState<ChildOption[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordMessage, setRecordMessage] = useState('');
  const [visitType, setVisitType] = useState<'ANC' | 'PNC' | 'CHILD'>('ANC');
  const [selectedMotherId, setSelectedMotherId] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bp, setBp] = useState('');
  const [fhr, setFhr] = useState('');
  const [notes, setNotes] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const ancRows = maternalRows.filter((row) => row.careType === 'ANC');
  const pncRows = maternalRows.filter((row) => row.careType === 'PNC');

  useEffect(() => {
    let isMounted = true;

    async function loadRecords() {
      if (!user?.email) {
        if (isMounted) {
          setMaternalRows([]);
          setChildRows([]);
          setLoading(false);
        }
        return;
      }

      try {
        const [mothersSnapshot, pregnanciesSnapshot, maternalSnapshot, appointmentsSnapshot, childrenSnapshot, childSnapshot, growthSnapshot, growthAltSnapshot, immunizationSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'mothers')),
            getDocs(collection(firebaseDb, 'pregnancies')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'pncRecords')),
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'child')),
            getDocs(collection(firebaseDb, 'growthRecords')),
            getDocs(collection(firebaseDb, 'growth_records')),
            getDocs(collection(firebaseDb, 'immunizations')),
          ]);

        const doctorEmail = user.email.trim().toLowerCase();
        const doctorUid = user.uid;

        const mothersById = new Map<string, string>();
        const motherStatusById = new Map<string, string>();
        mothersSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = asLabel(data.firstName ?? data.first_name, '');
          const lastName = asLabel(data.lastName ?? data.last_name, '');
          const fullName = `${firstName} ${lastName}`.trim();
          mothersById.set(docItem.id, fullName || asLabel(data.full_name ?? data.name, 'Unknown Mother'));
          motherStatusById.set(docItem.id, asLabel(data.status ?? data.maternalStatus ?? data.stage, 'UNKNOWN'));
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
          const motherStatus = motherStatusById.get(motherId) || '';

          return {
            id: docItem.id,
            motherId,
            careType: inferCareTypeWithStatus(data, motherStatus),
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
            // Keep only ANC-style appointments in this table source.
            // PNC follow-ups should not appear in the PNC recorded-visits container.
            const typeText = asLabel(data.type ?? data.appointmentType ?? data.visitType ?? data.recordType ?? data.reason, '').toUpperCase();
            return typeText.includes('ANC') || typeText.includes('ANTENATAL') || typeText.includes('PRENATAL');
          })
          .map(({ id, data }) => {
            const motherId = asLabel(data.motherId ?? data.mother_id, '');
            const pregnancy = pregnanciesByMotherId.get(motherId);
            const gestation = asLabel(data.gestationWeeks ?? data.gestation, '-');
            const pregnancyStatus = asLabel(pregnancy?.status, 'Active');
            const motherStatus = motherStatusById.get(motherId) || '';

            return {
              id,
              motherId,
              careType: 'ANC',
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
          })
          .sort((a, b) => b.checkupDate.localeCompare(a.checkupDate));

        const growthByChildId = new Map<string, Record<string, unknown>>();
        [...growthSnapshot.docs, ...growthAltSnapshot.docs].forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const linkedChildId = key(data.childId ?? data.child_id ?? data.childDocId);
          const ownId = key(docItem.id);
          if (linkedChildId && !growthByChildId.has(linkedChildId)) {
            growthByChildId.set(linkedChildId, data);
          }
          if (ownId && !growthByChildId.has(ownId)) {
            growthByChildId.set(ownId, data);
          }
        });

        const immunizationByChildId = new Map<string, Record<string, unknown>>();
        immunizationSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const linkedChildId = key(data.childId ?? data.child_id ?? data.childDocId);
          const ownId = key(docItem.id);
          if (linkedChildId && !immunizationByChildId.has(linkedChildId)) {
            immunizationByChildId.set(linkedChildId, data);
          }
          if (ownId && !immunizationByChildId.has(ownId)) {
            immunizationByChildId.set(ownId, data);
          }
        });

        const child: ChildRow[] = [...childrenSnapshot.docs, ...childSnapshot.docs].map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          const growth = growthByChildId.get(key(docItem.id));
          const immunization = immunizationByChildId.get(key(docItem.id));

          return {
            id: docItem.id,
            childName: asLabel(data.fullName ?? data.name ?? data.childName, 'Unknown Child'),
            mother: asLabel(data.motherName, mothersById.get(motherId) || '-'),
            dob: asDateLabel(data.birthDate ?? data.dateOfBirth ?? data.dob),
            weight: asLabel(growth?.weight ?? data.birthWeightKg ?? data.weight, '-'),
            height: asLabel(growth?.height ?? data.height, '-'),
            recentVaccine: asLabel(immunization?.vaccine ?? immunization?.vaccineName, '-'),
            vaccineStatus: asLabel(immunization?.status, 'Due'),
          };
        }).filter((row) => row.weight !== '-' || row.height !== '-' || row.recentVaccine !== '-');

        const mappedChildren: ChildOption[] = childrenSnapshot.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          const motherName = mothersById.get(motherId) || asLabel(data.motherName, 'Unknown Mother');

          return {
            id: docItem.id,
            name: asLabel(data.name ?? data.childName, 'Unknown Child'),
            motherId,
            motherName,
          };
        });

        if (isMounted) {
          setMaternalRows(combinedMaternal);
          setChildRows(child);
          setMotherOptions(mappedMothers.sort((a, b) => a.name.localeCompare(b.name)));
          setChildOptions(mappedChildren.sort((a, b) => a.name.localeCompare(b.name)));
          if (!selectedMotherId && mappedMothers.length > 0) {
            setSelectedMotherId(mappedMothers[0].id);
          }
          if (!selectedChildId && mappedChildren.length > 0) {
            setSelectedChildId(mappedChildren[0].id);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRecords();

    return () => {
      isMounted = false;
    };
  }, [reloadToken, selectedChildId, selectedMotherId, user?.email, user?.uid]);

  async function handleRecordVisit() {
    setRecordMessage('');

    const selectedMother = motherOptions.find((item) => item.id === selectedMotherId) || null;
    const selectedChild = childOptions.find((item) => item.id === selectedChildId) || null;

    if ((visitType === 'ANC' || visitType === 'PNC') && !selectedMother) {
      setRecordMessage('Select a mother first.');
      return;
    }

    if (visitType === 'CHILD' && !selectedChild) {
      setRecordMessage('Select a child first.');
      return;
    }

    setRecording(true);
    try {
      const dateIso = new Date(`${visitDate}T09:00:00`).toISOString();

      if (visitType === 'ANC') {
        await addDoc(collection(firebaseDb, 'maternalRecords'), {
          motherId: selectedMother?.id || '',
          motherName: selectedMother?.name || '',
          type: visitType,
          visitType,
          checkupDate: dateIso,
          date: dateIso,
          weight: weight.trim(),
          bloodPressure: bp.trim(),
          bp: bp.trim(),
          fetalHeartRate: visitType === 'ANC' ? fhr.trim() : '',
          fhr: visitType === 'ANC' ? fhr.trim() : '',
          clinicalObservations: notes.trim(),
          notes: notes.trim(),
          doctorUid: user?.uid || '',
          doctorEmail: user?.email || '',
          createdAt: new Date().toISOString(),
        });
      } else if (visitType === 'PNC') {
        await addDoc(collection(firebaseDb, 'pncRecords'), {
          motherId: selectedMother?.id || '',
          motherName: selectedMother?.name || '',
          type: 'PNC',
          visitType: 'PNC',
          recordType: 'PNC',
          stage: 'POSTNATAL',
          checkupDate: dateIso,
          date: dateIso,
          weight: weight.trim(),
          bloodPressure: bp.trim(),
          bp: bp.trim(),
          clinicalObservations: notes.trim(),
          notes: notes.trim(),
          doctorUid: user?.uid || '',
          doctorEmail: user?.email || '',
          createdAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(firebaseDb, 'child_growth'), {
          childId: selectedChild?.id || '',
          childName: selectedChild?.name || '',
          motherId: selectedChild?.motherId || '',
          motherName: selectedChild?.motherName || '',
          visitType: 'CHILD',
          checkupDate: dateIso,
          date: dateIso,
          weight: weight.trim(),
          height: height.trim(),
          notes: notes.trim(),
          doctorUid: user?.uid || '',
          doctorEmail: user?.email || '',
          createdAt: new Date().toISOString(),
        });
      }

      setRecordMessage('Visit recorded successfully.');
      setWeight('');
      setHeight('');
      setBp('');
      setFhr('');
      setNotes('');
      setReloadToken((current) => current + 1);
    } catch {
      setRecordMessage('Could not record visit.');
    } finally {
      setRecording(false);
    }
  }

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Medical Records</h1>
            <p className="page-subtitle">Track pregnancy progressions, child development indices, and vaccine status.</p>
          </div>
        </div>

        <div className="content-card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span>Record New Visit</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
            <label>
              <div className="text-muted">Visit Type</div>
              <select className="table-filter-input" value={visitType} onChange={(event) => setVisitType(event.target.value as 'ANC' | 'PNC' | 'CHILD')}>
                <option value="ANC">ANC Visit</option>
                <option value="PNC">PNC Visit</option>
                <option value="CHILD">Child Visit</option>
              </select>
            </label>

            {(visitType === 'ANC' || visitType === 'PNC') ? (
              <label>
                <div className="text-muted">Mother</div>
                <select className="table-filter-input" value={selectedMotherId} onChange={(event) => setSelectedMotherId(event.target.value)}>
                  {motherOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                <div className="text-muted">Child</div>
                <select className="table-filter-input" value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>
                  {childOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.motherName})</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <div className="text-muted">Visit Date</div>
              <input className="table-filter-input" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
            </label>

            <label>
              <div className="text-muted">Weight (kg)</div>
              <input className="table-filter-input" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="e.g. 68" />
            </label>

            {visitType === 'CHILD' ? (
              <label>
                <div className="text-muted">Height (cm)</div>
                <input className="table-filter-input" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="e.g. 67" />
              </label>
            ) : (
              <label>
                <div className="text-muted">Blood Pressure</div>
                <input className="table-filter-input" value={bp} onChange={(event) => setBp(event.target.value)} placeholder="e.g. 120/80" />
              </label>
            )}

            {visitType === 'ANC' ? (
              <label>
                <div className="text-muted">Fetal Heart Rate</div>
                <input className="table-filter-input" value={fhr} onChange={(event) => setFhr(event.target.value)} placeholder="e.g. 142 bpm" />
              </label>
            ) : null}

            <label style={{ gridColumn: '1 / -1' }}>
              <div className="text-muted">Clinical Notes</div>
              <input className="table-filter-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Visit observations" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleRecordVisit} disabled={recording}>
              {recording ? 'Saving...' : 'Save Visit Record'}
            </button>
            {recordMessage ? <span className="text-muted">{recordMessage}</span> : null}
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
