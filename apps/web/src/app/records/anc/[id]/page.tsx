"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDoc, getDocs, limit, query, where, firebaseDb } from '@/lib/firebaseClient';
import { useAuth } from '@/components/AuthProvider';

interface AncDetailsPageProps {
  params: Promise<{ id: string }>;
}

interface MotherInfo {
  name: string;
  phone: string;
  gestation: string;
  expectedDelivery: string;
}

interface AncVisitRow {
  id: string;
  date: string;
  bp: string;
  fhr: string;
  notes: string;
}

interface AncFormState {
  date: string;
  gestationWeeks: string;
  facility: string;
  weight: string;
  bp: string;
  hb: string;
  urine: string;
  fundalHeight: string;
  presentation: string;
  fhr: string;
  fetalMovement: string;
  hiv: string;
  ifa: string;
  tt: string;
  nextVisit: string;
  notes: string;
}

const defaultFormState: AncFormState = {
  date: '',
  gestationWeeks: '',
  facility: '',
  weight: '',
  bp: '',
  hb: '',
  urine: '',
  fundalHeight: '',
  presentation: '',
  fhr: '',
  fetalMovement: '',
  hiv: '',
  ifa: '',
  tt: '',
  nextVisit: '',
  notes: '',
};

function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

function resolveMotherName(data: Record<string, unknown>): string {
  const firstName = readText(data.firstName || data.first_name, '');
  const lastName = readText(data.lastName || data.last_name, '');
  const fullFromSplit = `${firstName} ${lastName}`.trim();
  return readText(data.fullName || data.full_name || data.name || data.displayName, fullFromSplit || 'Unknown Mother');
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseGestationWeeks(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function computeEddFromGestationWeeks(weeks: number | null): string {
  if (!weeks || !Number.isFinite(weeks)) return '-';

  const remainingWeeks = Math.max(0, 40 - weeks);
  const dueDate = new Date(Date.now() + remainingWeeks * 7 * 24 * 60 * 60 * 1000);
  return dueDate.toISOString().slice(0, 10);
}

function computeGestationFromDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const days = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return '';
  const weeks = Math.max(1, Math.floor(days / 7));
  return String(weeks);
}

export default function AncDetailsPage({ params }: AncDetailsPageProps) {
  const { user } = useAuth();
  const [motherId, setMotherId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AncFormState>(defaultFormState);
  const [motherGestationWeeks, setMotherGestationWeeks] = useState('');
  const [doctorFacility, setDoctorFacility] = useState('');
  const [mother, setMother] = useState<MotherInfo>({
    name: 'Unknown Mother',
    phone: '-',
    gestation: '-',
    expectedDelivery: '-',
  });
  const [visits, setVisits] = useState<AncVisitRow[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const resolved = await params;
      if (!isMounted) return;

      const id = resolved.id;
      setMotherId(id);

      try {
        const [motherPrimaryDoc, motherFallbackDoc] = await Promise.all([
          getDoc(doc(firebaseDb, 'mothers', id)),
          getDoc(doc(firebaseDb, 'Mothers', id)),
        ]);

        const motherSource = motherPrimaryDoc.exists() ? motherPrimaryDoc : motherFallbackDoc;
        if (motherSource.exists()) {
          const data = motherSource.data() as Record<string, unknown>;
          const gestationValue = readText(data.gestation || data.gestationWeeks || data.pregnancyWeek || data.week, '');
          const gestationFromDate =
            computeGestationFromDate(data.lmp || data.lmpDate || data.lastMenstrualPeriod || data.last_menstrual_period) ||
            computeGestationFromDate(data.pregnancyStartDate || data.startDate || data.createdAt);
          const resolvedGestation = gestationValue || gestationFromDate;
          const gestationWeeksNumber =
            parseGestationWeeks(data.gestationWeeks) ||
            parseGestationWeeks(data.gestation) ||
            parseGestationWeeks(data.pregnancyWeek) ||
            parseGestationWeeks(data.week) ||
            parseGestationWeeks(resolvedGestation);
          const storedEdd = readText(data.expectedDeliveryDate || data.edd || data.deliveryDate, '');
          const computedEdd = computeEddFromGestationWeeks(gestationWeeksNumber);
          setMotherGestationWeeks(resolvedGestation);

          setMother({
            name: resolveMotherName(data),
            phone: readText(data.phone || data.phoneNumber, '-'),
            gestation: resolvedGestation ? `${resolvedGestation} weeks` : '-',
            expectedDelivery: storedEdd || computedEdd || '-',
          });
        }

        const maternalRecordsSnapshot = await getDocs(collection(firebaseDb, 'maternalRecords'));
        const appointmentRows: AncVisitRow[] = maternalRecordsSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item: any) => {
            const sameMother = (item.motherId || item.mother_id) === id;
            const visitType = String(item.visitType || item.type || item.recordType || '').toUpperCase();
            const isAnc = visitType.includes('ANC') || visitType.includes('ANTENATAL');
            return sameMother && isAnc;
          })
          .map((item: any) => ({
            id: item.id,
            date: item.checkupDate || item.date || '-',
            bp: item.bp || item.bloodPressure || '-',
            fhr: item.fhr ? `${item.fhr} bpm` : item.fetalHeartRate ? `${item.fetalHeartRate} bpm` : '-',
            notes: item.notes || item.clinicalObservations || 'No notes recorded.',
          }));

        setVisits(appointmentRows);
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

  useEffect(() => {
    async function loadDoctorFacility() {
      if (!user?.email) return;

      const doctorEmail = user.email.trim().toLowerCase();
      const [doctorsSnapshot, doctorsCapsSnapshot] = await Promise.all([
        getDocs(query(collection(firebaseDb, 'doctors'), where('email', '==', doctorEmail), limit(1))),
        getDocs(query(collection(firebaseDb, 'Doctors'), where('email', '==', doctorEmail), limit(1))),
      ]);

      let docData: Record<string, unknown> | null = null;
      if (!doctorsSnapshot.empty) {
        docData = doctorsSnapshot.docs[0].data() as Record<string, unknown>;
      } else if (!doctorsCapsSnapshot.empty) {
        docData = doctorsCapsSnapshot.docs[0].data() as Record<string, unknown>;
      } else {
        const [allDoctorsSnapshot, allDoctorsCapsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'doctors')),
          getDocs(collection(firebaseDb, 'Doctors')),
        ]);

        const combined = [...allDoctorsSnapshot.docs, ...allDoctorsCapsSnapshot.docs];
        const matched = combined.find((item) => {
          const data = item.data() as Record<string, unknown>;
          const candidateEmail = normalizeEmail(data.email || data.Email || data.userEmail || data.user_email);
          const candidateUid = readText(data.uid || data.userId || data.user_id || data.firebaseUid, '');
          return candidateEmail === doctorEmail || (user.uid && candidateUid === user.uid);
        });

        if (matched) {
          docData = matched.data() as Record<string, unknown>;
        }
      }

      if (!docData) return;

      const facility = readText(
        docData.facility ||
          docData.hospital ||
          docData.healthFacility ||
          docData.healthCenter ||
          docData.health_centre,
        ''
      );
      if (facility) {
        setDoctorFacility(facility);
      }
    }

    loadDoctorFacility();
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!showForm) return;
    setForm((prev) => ({
      ...prev,
      date: todayIsoDate(),
      gestationWeeks: prev.gestationWeeks || motherGestationWeeks,
      facility: prev.facility || doctorFacility,
    }));
  }, [doctorFacility, motherGestationWeeks, showForm]);

  async function saveAncVisit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!motherId) {
      setError('Mother ID is missing.');
      return;
    }

    if (!form.date || !form.gestationWeeks || !form.bp || !form.fhr) {
      setError('Please fill all required fields.');
      return;
    }

    setSaving(true);
    try {
      const created = await addDoc(collection(firebaseDb, 'maternalRecords'), {
        motherId,
        mother_id: motherId,
        motherName: mother.name,
        doctorEmail: user?.email || '',
        doctorUid: user?.uid || '',
        visitType: 'ANC',
        recordType: 'ANC',
        type: 'ANC',
        checkupDate: form.date,
        date: form.date,
        gestationWeeks: Number(form.gestationWeeks),
        facility: form.facility,
        weight: form.weight ? Number(form.weight) : null,
        bp: form.bp,
        hb: form.hb ? Number(form.hb) : null,
        urine: form.urine,
        fundalHeight: form.fundalHeight ? Number(form.fundalHeight) : null,
        presentation: form.presentation,
        fhr: Number(form.fhr),
        fetalMovement: form.fetalMovement,
        hiv: form.hiv,
        ifa: form.ifa,
        tt: form.tt,
        nextVisit: form.nextVisit,
        nextAppointmentDate: form.nextVisit,
        clinicalObservations: form.notes,
        notes: form.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (form.nextVisit) {
        await addDoc(collection(firebaseDb, 'appointments'), {
          motherId,
          mother_id: motherId,
          motherName: mother.name,
          doctorEmail: user?.email || '',
          doctorUid: user?.uid || '',
          appointmentType: 'ANC FOLLOW-UP',
          type: 'ANC',
          reason: 'ANC follow-up visit',
          status: 'PENDING',
          date: form.nextVisit,
          dateTime: form.nextVisit,
          sourceRecord: 'ANC',
          createdAt: new Date().toISOString(),
        });
      }

      setVisits((prev) => [
        {
          id: created.id,
          date: form.date,
          bp: form.bp,
          fhr: `${form.fhr} bpm`,
          notes: form.notes || 'No notes recorded.',
        },
        ...prev,
      ]);

      setForm({
        ...defaultFormState,
        date: todayIsoDate(),
        gestationWeeks: motherGestationWeeks,
        facility: doctorFacility,
      });
      setShowForm(false);
    } catch {
      setError('Failed to save ANC visit. Please try again.');
    } finally {
      setSaving(false);
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
          <h1 className="page-title">ANC Visit Details</h1>
          <p className="page-subtitle">Live Firestore maternal appointment details.</p>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Mother Information</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>Mother ID: {motherId}</div>
          <div>Name: {mother.name}</div>
          <div>Gestation: {mother.gestation}</div>
          <div>Phone: {mother.phone}</div>
          <div>Expected Delivery: {mother.expectedDelivery}</div>
        </div>
      </div>

      <div className="content-card">
        <div className="card-header">
          <span>Antenatal Contacts</span>
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowForm(true)}>
            + Add ANC Visit
          </button>
        </div>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>BP</th>
                <th>FHR</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>Loading ANC visits...</td>
                </tr>
              ) : visits.length === 0 ? (
                <tr>
                  <td colSpan={4}>No ANC records found for this mother.</td>
                </tr>
              ) : (
                visits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.date}</td>
                    <td>{visit.bp}</td>
                    <td>{visit.fhr}</td>
                    <td>{visit.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              <h3 style={{ margin: 0 }}>Record ANC Visit</h3>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Close</button>
            </div>

            <form onSubmit={saveAncVisit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input className="form-input" type="date" value={form.date} readOnly required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gestation (weeks) *</label>
                  <input className="form-input" type="number" min={4} max={42} value={form.gestationWeeks} readOnly required />
                </div>
                <div className="form-group">
                  <label className="form-label">Facility / Health Centre</label>
                  <input className="form-input" value={form.facility} readOnly />
                </div>
                <div className="form-group">
                  <label className="form-label">Weight (kg)</label>
                  <input className="form-input" type="number" step="0.1" value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Blood Pressure *</label>
                  <input className="form-input" placeholder="120/80" value={form.bp} onChange={(e) => setForm((p) => ({ ...p, bp: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Haemoglobin (Hb g/dL)</label>
                  <input className="form-input" type="number" step="0.1" value={form.hb} onChange={(e) => setForm((p) => ({ ...p, hb: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Urine (Dipstick)</label>
                  <select className="form-input" value={form.urine} onChange={(e) => setForm((p) => ({ ...p, urine: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Normal">Normal</option>
                    <option value="Proteinuria (+)">Proteinuria (+)</option>
                    <option value="Proteinuria (++)">Proteinuria (++)</option>
                    <option value="Glucosuria">Glucosuria</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fundal Height (cm)</label>
                  <input className="form-input" type="number" step="0.5" value={form.fundalHeight} onChange={(e) => setForm((p) => ({ ...p, fundalHeight: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Presentation</label>
                  <select className="form-input" value={form.presentation} onChange={(e) => setForm((p) => ({ ...p, presentation: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Cephalic">Cephalic</option>
                    <option value="Breech">Breech</option>
                    <option value="Transverse">Transverse</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Foetal Heart Rate (bpm) *</label>
                  <input className="form-input" type="number" min={60} max={200} value={form.fhr} onChange={(e) => setForm((p) => ({ ...p, fhr: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Foetal Movement</label>
                  <select className="form-input" value={form.fetalMovement} onChange={(e) => setForm((p) => ({ ...p, fetalMovement: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Present / Good">Present / Good</option>
                    <option value="Reduced">Reduced</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">HIV Status</label>
                  <select className="form-input" value={form.hiv} onChange={(e) => setForm((p) => ({ ...p, hiv: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Negative">Negative</option>
                    <option value="Positive">Positive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Iron / Folic Acid</label>
                  <select className="form-input" value={form.ifa} onChange={(e) => setForm((p) => ({ ...p, ifa: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Given">Given</option>
                    <option value="Not given">Not given</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">TT Vaccination</label>
                  <select className="form-input" value={form.tt} onChange={(e) => setForm((p) => ({ ...p, tt: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Given This Visit">Given This Visit</option>
                    <option value="Up to date">Up to date</option>
                    <option value="Not given">Not given</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Next Visit Date</label>
                  <input className="form-input" type="date" value={form.nextVisit} onChange={(e) => setForm((p) => ({ ...p, nextVisit: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes & Clinical Plan</label>
                <textarea className="form-input" rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              {error ? <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>{error}</p> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Visit'}
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
