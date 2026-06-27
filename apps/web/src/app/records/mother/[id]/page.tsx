"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
import { useAuth } from '@/components/AuthProvider';

interface MotherPncPageProps {
  params: Promise<{ id: string }>;
}

interface MotherPncRecord {
  motherName: string;
  childName: string;
  motherId: string;
  dob: string;
  deliveryDate: string;
  gravidaPara: string;
  pncVisits: number;
  postpartumWeeks: number | null;
  notes: string;
}

interface PncVisitRow {
  id: string;
  weight: string;
  bp: string;
  deliveryType: string;
  woundStatus: string;
  breastfeeding: string;
  painLevel: string;
  generalHealth: string;
  nextAppointmentDate: string;
  notes: string;
}

interface PncFormState {
  weight: string;
  bp: string;
  deliveryType: string;
  woundStatus: '' | 'Healing Well' | 'Needs Attention';
  breastfeeding: '' | 'Yes' | 'No';
  painLevel: '' | 'None' | 'Mild' | 'Moderate' | 'Severe';
  generalHealth: '' | 'Good' | 'Fair' | 'Poor';
  notes: string;
  nextAppointmentDate: string;
}

const defaultPncForm: PncFormState = {
  weight: '',
  bp: '',
  deliveryType: '',
  woundStatus: '',
  breastfeeding: '',
  painLevel: '',
  generalHealth: '',
  notes: '',
  nextAppointmentDate: '',
};

const emptyRecord: MotherPncRecord = {
  motherName: 'Unknown Mother',
  childName: '-',
  motherId: '-',
  dob: '-',
  deliveryDate: '-',
  gravidaPara: '-',
  pncVisits: 0,
  postpartumWeeks: null,
  notes: 'No notes available.',
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function resolveMotherName(data: Record<string, unknown>, fallback = 'Unknown Mother'): string {
  const firstName = asText(data.firstName ?? data.first_name);
  const lastName = asText(data.lastName ?? data.last_name);
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  const direct = asText(data.full_name ?? data.name ?? data.displayName);
  return direct || fallback;
}

function sameId(left: unknown, right: unknown): boolean {
  const a = asText(left).toLowerCase();
  const b = asText(right).toLowerCase();
  return Boolean(a && b && a === b);
}

function asDateText(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return ((value as { toDate: () => Date }).toDate().toISOString().slice(0, 10));
    } catch {
      return '';
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return trimmed;
  }

  return '';
}

function resolveChildDob(data: Record<string, unknown>): string {
  return asDateText(data.birthDate ?? data.dateOfBirth ?? data.dob ?? data.date_of_birth ?? data.birth_date) || '-';
}

function sameText(left: unknown, right: unknown): boolean {
  const a = asText(left).toLowerCase();
  const b = asText(right).toLowerCase();
  return Boolean(a && b && a === b);
}

export default function MotherPncPage({ params }: MotherPncPageProps) {
  const { user } = useAuth();
  const [id, setId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<PncFormState>(defaultPncForm);
  const [pncVisits, setPncVisits] = useState<PncVisitRow[]>([]);
  const [record, setRecord] = useState<MotherPncRecord>(emptyRecord);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const resolved = await params;
      if (!isMounted) return;

      const motherId = resolved.id;
      setId(motherId);

      try {
        const motherDoc = await getDoc(doc(firebaseDb, 'mothers', motherId));
        const [maternalSnapshot, pncSnapshot, childrenSnapshot, childSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'maternalRecords')),
          getDocs(collection(firebaseDb, 'pncRecords')),
          getDocs(collection(firebaseDb, 'children')),
          getDocs(collection(firebaseDb, 'child')),
        ]);

        const maternalRows = [...maternalSnapshot.docs, ...pncSnapshot.docs]
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((row: any) => row.motherId === motherId || row.mother_id === motherId);

        const latest = (maternalRows[0] || {}) as Record<string, unknown>;
        const maternalMotherName = asText(latest.motherName) || 'Unknown Mother';
        const pncRows = maternalRows.filter((row: any) => {
          const type = String(row.recordType || row.type || '').toUpperCase();
          return type.includes('PNC') || type.includes('POSTNATAL');
        });

        const motherData = motherDoc.exists() ? (motherDoc.data() as Record<string, unknown>) : {};
        const motherNameCandidates = [
          resolveMotherName(motherData, ''),
          asText(motherData.full_name),
          asText(motherData.name),
          asText(motherData.displayName),
        ].filter((value) => value.length > 0);
        const motherPhone = asText(motherData.phone);

        const allChildDocs = [...childrenSnapshot.docs, ...childSnapshot.docs];

        const childRows = allChildDocs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter(
            (row: any) =>
              sameId(row.motherId, motherId) ||
              sameId(row.mother_id, motherId) ||
              sameId(row.motherDocId, motherId) ||
              sameId(row.parentId, motherId) ||
              sameId(row.motherRef, motherId) ||
              motherNameCandidates.some((name) =>
                sameText(row.motherName, name) ||
                sameText(row.motherFullName, name) ||
                sameText(row.parentName, name)
              ) ||
              (motherPhone ? sameText(row.motherPhone, motherPhone) || sameText(row.parentPhone, motherPhone) : false)
          );

        const childNames = childRows
          .map((row: any) => row.fullName || row.name || row.full_name || row.childName)
          .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0);

        const childDob = childRows.length
          ? resolveChildDob(childRows[0] as Record<string, unknown>)
          : '-';

        const visitRows: PncVisitRow[] = pncRows.map((row: any) => ({
          id: row.id,
          weight: row.weight ? `${row.weight} kg` : '-',
          bp: row.bp || row.bloodPressure || '-',
          deliveryType: row.deliveryType || '-',
          woundStatus: row.woundStatus || '-',
          breastfeeding: row.breastfeedingStatus || '-',
          painLevel: row.painLevel || '-',
          generalHealth: row.generalHealth || '-',
          nextAppointmentDate: row.nextAppointmentDate || '-',
          notes: row.notes || row.clinicalObservations || 'No notes available.',
        }));
        setPncVisits(visitRows);

        let nextRecord = { ...emptyRecord, motherId };

        if (motherDoc.exists()) {
          const data = motherDoc.data();
          const deliveryDate = data.deliveryDate || data.lastDeliveryDate || '-';
          const postpartumWeeks = deliveryDate && deliveryDate !== '-'
            ? Math.max(0, Math.floor((Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24 * 7)))
            : null;

          nextRecord = {
            ...nextRecord,
            motherName: resolveMotherName(data as Record<string, unknown>, maternalMotherName),
            childName: childNames.length
              ? childNames.join(', ')
              : asText(data.childName ?? data.babyName ?? data.child_name) || '-',
            dob: childDob,
            deliveryDate,
            gravidaPara: data.gravidaPara || data.obstetricSummary || '-',
            postpartumWeeks,
          };
        } else {
          nextRecord = {
            ...nextRecord,
            motherName: maternalMotherName,
            childName: childNames.length ? childNames.join(', ') : '-',
            dob: childDob,
          };
        }

        nextRecord = {
          ...nextRecord,
          pncVisits: pncRows.length,
          notes:
            String(latest.notes || latest.clinicalObservations || latest.plan || 'No notes available.'),
        };

        setRecord(nextRecord);
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

  async function savePncVisit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    if (!id) {
      setFormError('Mother ID is missing.');
      return;
    }

    if (!form.weight || !form.bp || !form.deliveryType || !form.woundStatus || !form.breastfeeding || !form.painLevel || !form.generalHealth) {
      setFormError('Please fill all required fields.');
      return;
    }

    setSaving(true);
    try {
      const created = await addDoc(collection(firebaseDb, 'pncRecords'), {
        motherId: id,
        mother_id: id,
        motherName: record.motherName,
        doctorEmail: user?.email || '',
        doctorUid: user?.uid || '',
        recordType: 'PNC',
        visitType: 'PNC',
        type: 'POSTNATAL',
        stage: 'POSTNATAL',
        weight: Number(form.weight),
        bp: form.bp,
        bloodPressure: form.bp,
        deliveryType: form.deliveryType,
        woundStatus: form.woundStatus,
        breastfeedingStatus: form.breastfeeding,
        painLevel: form.painLevel,
        generalHealth: form.generalHealth,
        notes: form.notes,
        nextAppointmentDate: form.nextAppointmentDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (form.nextAppointmentDate) {
        await addDoc(collection(firebaseDb, 'appointments'), {
          motherId: id,
          mother_id: id,
          motherName: record.motherName,
          doctorEmail: user?.email || '',
          doctorUid: user?.uid || '',
          appointmentType: 'PNC FOLLOW-UP',
          type: 'POSTNATAL',
          reason: 'PNC follow-up visit',
          status: 'PENDING',
          date: form.nextAppointmentDate,
          dateTime: form.nextAppointmentDate,
          sourceRecord: 'PNC',
          createdAt: new Date().toISOString(),
        });
      }

      setPncVisits((prev) => [
        {
          id: created.id,
          weight: `${form.weight} kg`,
          bp: form.bp,
          deliveryType: form.deliveryType,
          woundStatus: form.woundStatus,
          breastfeeding: form.breastfeeding,
          painLevel: form.painLevel,
          generalHealth: form.generalHealth,
          nextAppointmentDate: form.nextAppointmentDate || '-',
          notes: form.notes || 'No notes available.',
        },
        ...prev,
      ]);

      setRecord((prev) => ({
        ...prev,
        pncVisits: prev.pncVisits + 1,
        notes: form.notes || prev.notes,
      }));

      setForm(defaultPncForm);
      setShowForm(false);
    } catch {
      setFormError('Failed to save PNC record. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <div style={{ marginBottom: '10px' }}>
            <Link href={id ? `/mothers/${id}` : '/mothers'} className="btn btn-secondary btn-compact">
              Back
            </Link>
          </div>
          <h1 className="page-title">Maternal PNC Record</h1>
          <p className="page-subtitle">Live Firestore maternal postnatal record view.</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Mother Overview</span>
        </div>
        {loading ? (
          <p>Loading maternal record...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>Name: {record.motherName}</div>
            <div>Child: {record.childName}</div>
            <div>ID: {id || record.motherId}</div>
            <div>Child DOB: {record.dob}</div>
            <div>PNC Visits: {record.pncVisits}</div>
          </div>
        )}
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Postnatal Visits</span>
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowForm(true)}>
            + Add PNC Record
          </button>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Weight</th>
                <th>BP</th>
                <th>Delivery Type</th>
                <th>Wound</th>
                <th>Breastfeeding</th>
                <th>Pain</th>
                <th>General Health</th>
                <th>Next Appointment</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>Loading PNC visits...</td>
                </tr>
              ) : pncVisits.length === 0 ? (
                <tr>
                  <td colSpan={9}>No PNC records found for this mother.</td>
                </tr>
              ) : (
                pncVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.weight}</td>
                    <td>{visit.bp}</td>
                    <td>{visit.deliveryType}</td>
                    <td>{visit.woundStatus}</td>
                    <td>{visit.breastfeeding}</td>
                    <td>{visit.painLevel}</td>
                    <td>{visit.generalHealth}</td>
                    <td>{visit.nextAppointmentDate}</td>
                    <td>{visit.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Visit Summary</span>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>
          Postpartum period: {record.postpartumWeeks ?? '-'} weeks. {record.notes}
        </p>
      </div>

      {showForm && portalReady
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
                  <h3 style={{ margin: 0 }}>Record PNC Visit</h3>
                  <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Close</button>
                </div>

                <form onSubmit={savePncVisit}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Weight (kg) *</label>
                      <input className="form-input" type="number" min={30} step="0.1" value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} required />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Blood Pressure *</label>
                      <input className="form-input" placeholder="120/80" value={form.bp} onChange={(e) => setForm((p) => ({ ...p, bp: e.target.value }))} required />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Delivery Type *</label>
                      <input className="form-input" placeholder="e.g. Vaginal, C-section" value={form.deliveryType} onChange={(e) => setForm((p) => ({ ...p, deliveryType: e.target.value }))} required />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Wound Status *</label>
                      <select className="form-input" value={form.woundStatus} onChange={(e) => setForm((p) => ({ ...p, woundStatus: e.target.value as PncFormState['woundStatus'] }))} required>
                        <option value="">Select...</option>
                        <option value="Healing Well">Healing Well</option>
                        <option value="Needs Attention">Needs Attention</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Breastfeeding Status *</label>
                      <select className="form-input" value={form.breastfeeding} onChange={(e) => setForm((p) => ({ ...p, breastfeeding: e.target.value as PncFormState['breastfeeding'] }))} required>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Pain Level *</label>
                      <select className="form-input" value={form.painLevel} onChange={(e) => setForm((p) => ({ ...p, painLevel: e.target.value as PncFormState['painLevel'] }))} required>
                        <option value="">Select...</option>
                        <option value="None">None</option>
                        <option value="Mild">Mild</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Severe">Severe</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">General Health *</label>
                      <select className="form-input" value={form.generalHealth} onChange={(e) => setForm((p) => ({ ...p, generalHealth: e.target.value as PncFormState['generalHealth'] }))} required>
                        <option value="">Select...</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Next Appointment Date</label>
                      <input className="form-input" type="date" value={form.nextAppointmentDate} onChange={(e) => setForm((p) => ({ ...p, nextAppointmentDate: e.target.value }))} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input" rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>

                  {formError ? <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>{formError}</p> : null}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Saving...' : 'Save PNC Record'}
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
