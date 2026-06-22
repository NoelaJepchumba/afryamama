"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
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
  contact: string;
  date: string;
  bp: string;
  fhr: string;
  notes: string;
}

interface AncFormState {
  contactNo: string;
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
  contactNo: '',
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

export default function AncDetailsPage({ params }: AncDetailsPageProps) {
  const { user } = useAuth();
  const [motherId, setMotherId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AncFormState>(defaultFormState);
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
        const motherDoc = await getDoc(doc(firebaseDb, 'mothers', id));
        if (motherDoc.exists()) {
          const data = motherDoc.data();
          setMother({
            name: data.full_name || data.name || 'Unknown Mother',
            phone: data.phone || '-',
            gestation: data.gestation || data.gestationWeeks ? `${data.gestation || data.gestationWeeks} weeks` : '-',
            expectedDelivery: data.expectedDeliveryDate || data.edd || '-',
          });
        }

        const appointmentsSnapshot = await getDocs(collection(firebaseDb, 'appointments'));
        const appointmentRows: AncVisitRow[] = appointmentsSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item: any) => (item.motherId || item.mother_id) === id)
          .map((item: any) => ({
            id: item.id,
            contact: item.contactNo || item.contact || 'ANC Contact',
            date: item.date || '-',
            bp: item.bp || item.bloodPressure || '-',
            fhr: item.fhr ? `${item.fhr} bpm` : item.fetalHeartRate ? `${item.fetalHeartRate} bpm` : '-',
            notes: item.notes || item.reason || 'No notes recorded.',
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

  async function saveAncVisit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!motherId) {
      setError('Mother ID is missing.');
      return;
    }

    if (!form.contactNo || !form.date || !form.gestationWeeks || !form.bp || !form.fhr) {
      setError('Please fill all required fields.');
      return;
    }

    setSaving(true);
    try {
      const created = await addDoc(collection(firebaseDb, 'appointments'), {
        motherId,
        mother_id: motherId,
        motherName: mother.name,
        doctorEmail: user?.email || '',
        doctorUid: user?.uid || '',
        appointmentType: 'ANC',
        type: 'ANC',
        reason: `ANC ${form.contactNo}`,
        status: 'CONFIRMED',
        contactNo: form.contactNo,
        date: form.date,
        dateTime: form.date,
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
        notes: form.notes,
        createdAt: new Date().toISOString(),
      });

      setVisits((prev) => [
        {
          id: created.id,
          contact: form.contactNo,
          date: form.date,
          bp: form.bp,
          fhr: `${form.fhr} bpm`,
          notes: form.notes || 'No notes recorded.',
        },
        ...prev,
      ]);

      setForm(defaultFormState);
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
                <th>Contact</th>
                <th>Date</th>
                <th>BP</th>
                <th>FHR</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading ANC visits...</td>
                </tr>
              ) : visits.length === 0 ? (
                <tr>
                  <td colSpan={5}>No ANC records found for this mother.</td>
                </tr>
              ) : (
                visits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.contact}</td>
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
                  <label className="form-label">Contact No. *</label>
                  <select className="form-input" value={form.contactNo} onChange={(e) => setForm((p) => ({ ...p, contactNo: e.target.value }))} required>
                    <option value="">Select...</option>
                    <option value="1st Contact">1st Contact</option>
                    <option value="2nd Contact">2nd Contact</option>
                    <option value="3rd Contact">3rd Contact</option>
                    <option value="4th Contact">4th Contact</option>
                    <option value="5th Contact">5th Contact</option>
                    <option value="6th Contact">6th Contact</option>
                    <option value="7th Contact">7th Contact</option>
                    <option value="8th+ Contact">8th+ Contact</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input className="form-input" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Gestation (weeks) *</label>
                  <input className="form-input" type="number" min={4} max={42} value={form.gestationWeeks} onChange={(e) => setForm((p) => ({ ...p, gestationWeeks: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Facility / Health Centre</label>
                  <input className="form-input" value={form.facility} onChange={(e) => setForm((p) => ({ ...p, facility: e.target.value }))} />
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
