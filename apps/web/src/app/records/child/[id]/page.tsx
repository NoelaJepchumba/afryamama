"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, getDocs } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
import { useAuth } from '@/components/AuthProvider';

interface ChildRecordPageProps {
  params: Promise<{ id: string }>;
}

interface ChildSummary {
  childName: string;
  motherName: string;
  dob: string;
  sex: string;
  birthWeight: string;
  ageWeeks: number | null;
  ageMonths: number | null;
  childId: string;
}

interface ImmunizationRow {
  id: string;
  vaccine: string;
  dose: string;
  status: 'Given' | 'Not Given' | 'Due' | 'Overdue';
  nextVaccineDate: string;
}

interface GrowthRow {
  id: string;
  weight: string;
  height: string;
  headCircumference: string;
  nutritionalStatus: string;
  feedingType: string;
  generalHealth: string;
  notes: string;
  nextVisit: string;
}

interface GrowthFormState {
  weight: string;
  height: string;
  headCircumference: string;
  nutritionalStatus: string;
  feedingType: string;
  generalHealth: string;
  notes: string;
  nextVisit: string;
}

interface ImmunizationFormState {
  vaccine: string;
  dose: string;
  status: 'Given' | 'Not Given';
  nextVaccineDate: string;
}

const emptySummary: ChildSummary = {
  childName: 'Unknown Child',
  motherName: '-',
  dob: '-',
  sex: '-',
  birthWeight: '-',
  ageWeeks: null,
  ageMonths: null,
  childId: '-',
};

const defaultGrowthForm: GrowthFormState = {
  weight: '',
  height: '',
  headCircumference: '',
  nutritionalStatus: '',
  feedingType: '',
  generalHealth: '',
  notes: '',
  nextVisit: '',
};

const defaultImmunizationForm: ImmunizationFormState = {
  vaccine: '',
  dose: '',
  status: 'Given',
  nextVaccineDate: '',
};

export default function ChildRecordPage({ params }: ChildRecordPageProps) {
  const { user } = useAuth();
  const [motherId, setMotherId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGrowth, setSavingGrowth] = useState(false);
  const [savingImmunization, setSavingImmunization] = useState(false);
  const [showGrowthForm, setShowGrowthForm] = useState(false);
  const [showImmunizationForm, setShowImmunizationForm] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [formError, setFormError] = useState('');
  const [summary, setSummary] = useState<ChildSummary>(emptySummary);
  const [growthRows, setGrowthRows] = useState<GrowthRow[]>([]);
  const [immunizations, setImmunizations] = useState<ImmunizationRow[]>([]);
  const [growthForm, setGrowthForm] = useState<GrowthFormState>(defaultGrowthForm);
  const [immunizationForm, setImmunizationForm] = useState<ImmunizationFormState>(defaultImmunizationForm);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const resolved = await params;
      if (!isMounted) return;

      const id = resolved.id;
      setMotherId(id);

      try {
        const [mothersSnapshot, childrenSnapshot, immunizationSnapshot, growthSnapshot, growthAltSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'children')),
          getDocs(collection(firebaseDb, 'immunizations')),
          getDocs(collection(firebaseDb, 'growthRecords')),
          getDocs(collection(firebaseDb, 'growth_records')),
        ]);

        const motherDoc = mothersSnapshot.docs.find((item) => item.id === id);
        const motherName = motherDoc?.data().full_name || motherDoc?.data().name || '-';

        const childDoc = childrenSnapshot.docs.find((item) => {
          const data = item.data();
          return data.motherId === id || data.mother_id === id;
        });

        if (childDoc) {
          const child = childDoc.data();
          const dob = child.dateOfBirth || child.dob || '-';
          const ageInWeeks = dob !== '-'
            ? Math.max(0, Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 7)))
            : null;

          setSummary({
            childName: child.name || 'Unknown Child',
            motherName,
            dob,
            sex: child.gender || child.sex || '-',
            birthWeight: child.birthWeight ? `${child.birthWeight} kg` : '-',
            ageWeeks: ageInWeeks,
            ageMonths: ageInWeeks === null ? null : Math.floor(ageInWeeks / 4),
            childId: childDoc.id,
          });

          const growthData = [...growthSnapshot.docs, ...growthAltSnapshot.docs]
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((row: any) => row.childId === childDoc.id || row.child_id === childDoc.id)
            .map((row: any) => ({
              id: row.id,
              weight: row.weight ? `${row.weight} kg` : '-',
              height: row.height ? `${row.height} cm` : '-',
              headCircumference: row.headCircumference ? `${row.headCircumference} cm` : row.hc ? `${row.hc} cm` : '-',
              nutritionalStatus: row.nutritionalStatus || '-',
              feedingType: row.feedingType || '-',
              generalHealth: row.generalHealth || '-',
              notes: row.notes || 'No notes.',
              nextVisit: row.nextVisit || row.nextVisitDate || '-',
            }));

          setGrowthRows(growthData);

          const rows: ImmunizationRow[] = immunizationSnapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((row: any) => row.childId === childDoc.id || row.child_id === childDoc.id)
            .map((row: any) => ({
              id: row.id,
              vaccine: row.vaccine || row.vaccineName || 'Unknown Vaccine',
              dose: row.dose || row.schedule || '-',
              status: row.status === 'Given' || row.status === 'Not Given' || row.status === 'Overdue' ? row.status : 'Due',
              nextVaccineDate: row.nextVaccineDate || '-',
            }));

          setImmunizations(rows);
        } else {
          setSummary((prev) => ({ ...prev, motherName }));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [params]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  async function saveGrowthRecord(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    if (!summary.childId || summary.childId === '-') {
      setFormError('Child record is missing.');
      return;
    }

    if (!growthForm.weight || !growthForm.height || !growthForm.headCircumference || !growthForm.nutritionalStatus || !growthForm.feedingType || !growthForm.generalHealth) {
      setFormError('Please fill all required growth fields.');
      return;
    }

    setSavingGrowth(true);
    try {
      const created = await addDoc(collection(firebaseDb, 'growthRecords'), {
        motherId,
        childId: summary.childId,
        child_id: summary.childId,
        doctorEmail: user?.email || '',
        doctorUid: user?.uid || '',
        weight: Number(growthForm.weight),
        height: Number(growthForm.height),
        headCircumference: Number(growthForm.headCircumference),
        nutritionalStatus: growthForm.nutritionalStatus,
        feedingType: growthForm.feedingType,
        generalHealth: growthForm.generalHealth,
        notes: growthForm.notes,
        nextVisit: growthForm.nextVisit,
        createdAt: new Date().toISOString(),
      });

      if (growthForm.nextVisit) {
        await addDoc(collection(firebaseDb, 'appointments'), {
          motherId,
          mother_id: motherId,
          motherName: summary.motherName,
          doctorEmail: user?.email || '',
          doctorUid: user?.uid || '',
          appointmentType: 'CHILD GROWTH FOLLOW-UP',
          type: 'CHILD',
          reason: 'Child growth follow-up',
          status: 'PENDING',
          date: growthForm.nextVisit,
          dateTime: growthForm.nextVisit,
          childId: summary.childId,
          child_id: summary.childId,
          sourceRecord: 'GROWTH',
          createdAt: new Date().toISOString(),
        });
      }

      setGrowthRows((prev) => [
        {
          id: created.id,
          weight: `${growthForm.weight} kg`,
          height: `${growthForm.height} cm`,
          headCircumference: `${growthForm.headCircumference} cm`,
          nutritionalStatus: growthForm.nutritionalStatus,
          feedingType: growthForm.feedingType,
          generalHealth: growthForm.generalHealth,
          notes: growthForm.notes || 'No notes.',
          nextVisit: growthForm.nextVisit || '-',
        },
        ...prev,
      ]);

      setGrowthForm(defaultGrowthForm);
      setShowGrowthForm(false);
    } catch {
      setFormError('Failed to save growth record. Please try again.');
    } finally {
      setSavingGrowth(false);
    }
  }

  async function saveImmunizationRecord(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    if (!summary.childId || summary.childId === '-') {
      setFormError('Child record is missing.');
      return;
    }

    if (!immunizationForm.vaccine || !immunizationForm.dose) {
      setFormError('Please fill required immunization fields.');
      return;
    }

    setSavingImmunization(true);
    try {
      const created = await addDoc(collection(firebaseDb, 'immunizations'), {
        motherId,
        childId: summary.childId,
        child_id: summary.childId,
        doctorEmail: user?.email || '',
        doctorUid: user?.uid || '',
        vaccine: immunizationForm.vaccine,
        dose: immunizationForm.dose,
        status: immunizationForm.status,
        nextVaccineDate: immunizationForm.nextVaccineDate,
        createdAt: new Date().toISOString(),
      });

      if (immunizationForm.nextVaccineDate) {
        await addDoc(collection(firebaseDb, 'appointments'), {
          motherId,
          mother_id: motherId,
          motherName: summary.motherName,
          doctorEmail: user?.email || '',
          doctorUid: user?.uid || '',
          appointmentType: 'IMMUNIZATION FOLLOW-UP',
          type: 'CHILD',
          reason: `${immunizationForm.vaccine} follow-up (${immunizationForm.dose})`,
          status: 'PENDING',
          date: immunizationForm.nextVaccineDate,
          dateTime: immunizationForm.nextVaccineDate,
          childId: summary.childId,
          child_id: summary.childId,
          sourceRecord: 'IMMUNIZATION',
          createdAt: new Date().toISOString(),
        });
      }

      setImmunizations((prev) => [
        {
          id: created.id,
          vaccine: immunizationForm.vaccine,
          dose: immunizationForm.dose,
          status: immunizationForm.status,
          nextVaccineDate: immunizationForm.nextVaccineDate || '-',
        },
        ...prev,
      ]);

      setImmunizationForm(defaultImmunizationForm);
      setShowImmunizationForm(false);
    } catch {
      setFormError('Failed to save immunization record. Please try again.');
    } finally {
      setSavingImmunization(false);
    }
  }

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <div style={{ marginBottom: '10px' }}>
            <Link href={motherId ? `/mothers/${motherId}` : '/mothers'} className="btn btn-secondary btn-compact">
              Back
            </Link>
          </div>
          <h1 className="page-title">Child Record</h1>
          <p className="page-subtitle">Live Firestore child follow-up view.</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Child Summary</span>
        </div>
        {loading ? (
          <p>Loading child record...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>Name: {summary.childName}</div>
            <div>Mother: {summary.motherName}</div>
            <div>Mother ID: {motherId}</div>
            <div>DOB: {summary.dob}</div>
            <div>Sex: {summary.sex}</div>
            <div>Birth Weight: {summary.birthWeight}</div>
            <div>
              Age: {summary.ageWeeks ?? '-'} weeks ({summary.ageMonths ?? '-'} months)
            </div>
          </div>
        )}
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Growth Monitoring</span>
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowGrowthForm(true)}>
            + Add Child Growth Record
          </button>
        </div>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Weight</th>
                <th>Height</th>
                <th>Head Circumference</th>
                <th>Nutritional Status</th>
                <th>Feeding Type</th>
                <th>General Health</th>
                <th>Next Visit</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading growth records...</td>
                </tr>
              ) : growthRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No growth records found.</td>
                </tr>
              ) : (
                growthRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.weight}</td>
                    <td>{row.height}</td>
                    <td>{row.headCircumference}</td>
                    <td>{row.nutritionalStatus}</td>
                    <td>{row.feedingType}</td>
                    <td>{row.generalHealth}</td>
                    <td>{row.nextVisit}</td>
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
          <span>Immunization Status</span>
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowImmunizationForm(true)}>
            + Add Immunization Record
          </button>
        </div>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Vaccine</th>
                <th>Dose</th>
                <th>Status</th>
                <th>Next Vaccine Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>Loading immunizations...</td>
                </tr>
              ) : immunizations.length === 0 ? (
                <tr>
                  <td colSpan={4}>No immunization records found.</td>
                </tr>
              ) : (
                immunizations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.vaccine}</td>
                    <td>{row.dose}</td>
                    <td>
                      <span className={`badge ${row.status === 'Given' ? 'badge-success' : row.status === 'Not Given' || row.status === 'Overdue' ? 'badge-danger' : 'badge-warning'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.nextVaccineDate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGrowthForm && portalReady
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                zIndex: 3000,
                overflowY: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              }}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  width: '100%',
                  maxWidth: '820px',
                  margin: 0,
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Record Child Growth</h3>
                  <button className="btn btn-secondary" onClick={() => setShowGrowthForm(false)}>Close</button>
                </div>

                <form onSubmit={saveGrowthRecord}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Weight (kg) *</label>
                      <input className="form-input" type="number" step="0.1" value={growthForm.weight} onChange={(e) => setGrowthForm((p) => ({ ...p, weight: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Height (cm) *</label>
                      <input className="form-input" type="number" step="0.1" value={growthForm.height} onChange={(e) => setGrowthForm((p) => ({ ...p, height: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Head Circumference (cm) *</label>
                      <input className="form-input" type="number" step="0.1" value={growthForm.headCircumference} onChange={(e) => setGrowthForm((p) => ({ ...p, headCircumference: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nutritional Status *</label>
                      <input className="form-input" value={growthForm.nutritionalStatus} onChange={(e) => setGrowthForm((p) => ({ ...p, nutritionalStatus: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Feeding Type *</label>
                      <input className="form-input" value={growthForm.feedingType} onChange={(e) => setGrowthForm((p) => ({ ...p, feedingType: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">General Health *</label>
                      <input className="form-input" value={growthForm.generalHealth} onChange={(e) => setGrowthForm((p) => ({ ...p, generalHealth: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Next Visit Date</label>
                      <input className="form-input" type="date" value={growthForm.nextVisit} onChange={(e) => setGrowthForm((p) => ({ ...p, nextVisit: e.target.value }))} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input" rows={4} value={growthForm.notes} onChange={(e) => setGrowthForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>

                  {formError ? <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>{formError}</p> : null}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowGrowthForm(false)} disabled={savingGrowth}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={savingGrowth}>
                      {savingGrowth ? 'Saving...' : 'Save Growth Record'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {showImmunizationForm && portalReady
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                zIndex: 3000,
                overflowY: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              }}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  width: '100%',
                  maxWidth: '820px',
                  margin: 0,
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Record Immunization</h3>
                  <button className="btn btn-secondary" onClick={() => setShowImmunizationForm(false)}>Close</button>
                </div>

                <form onSubmit={saveImmunizationRecord}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Vaccine *</label>
                      <select className="form-input" value={immunizationForm.vaccine} onChange={(e) => setImmunizationForm((p) => ({ ...p, vaccine: e.target.value }))} required>
                        <option value="">Select vaccine...</option>
                        <option value="BCG">BCG</option>
                        <option value="OPV">OPV</option>
                        <option value="Pentavalent">Pentavalent</option>
                        <option value="PCV">PCV</option>
                        <option value="Rotavirus">Rotavirus</option>
                        <option value="Measles-Rubella">Measles-Rubella</option>
                        <option value="Yellow Fever">Yellow Fever</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Dose *</label>
                      <select className="form-input" value={immunizationForm.dose} onChange={(e) => setImmunizationForm((p) => ({ ...p, dose: e.target.value }))} required>
                        <option value="">Select dose...</option>
                        <option value="Dose 0">Dose 0</option>
                        <option value="Dose 1">Dose 1</option>
                        <option value="Dose 2">Dose 2</option>
                        <option value="Dose 3">Dose 3</option>
                        <option value="Booster">Booster</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Status *</label>
                      <select className="form-input" value={immunizationForm.status} onChange={(e) => setImmunizationForm((p) => ({ ...p, status: e.target.value as ImmunizationFormState['status'] }))} required>
                        <option value="Given">Given</option>
                        <option value="Not Given">Not Given</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Next Vaccine Date</label>
                      <input className="form-input" type="date" value={immunizationForm.nextVaccineDate} onChange={(e) => setImmunizationForm((p) => ({ ...p, nextVaccineDate: e.target.value }))} />
                    </div>
                  </div>

                  {formError ? <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>{formError}</p> : null}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowImmunizationForm(false)} disabled={savingImmunization}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={savingImmunization}>
                      {savingImmunization ? 'Saving...' : 'Save Immunization'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}
