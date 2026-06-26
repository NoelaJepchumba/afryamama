"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, firebaseDb } from '@/lib/firebaseClient';

interface MotherDetailsPageProps {
  params: Promise<{ id: string }>;
}

interface MotherSummary {
  id: string;
  name: string;
  phone: string;
  status: string;
  edd: string;
}

interface HistoryRow {
  id: string;
  date: string;
  source: string;
  details: string;
  status: string;
}

const emptyMother: MotherSummary = {
  id: '-',
  name: 'Unknown Mother',
  phone: '-',
  status: '-',
  edd: '-',
};

function toLabel(value: unknown, fallback = '-'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function toDateLabel(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return ((value as { toDate: () => Date }).toDate().toISOString().slice(0, 10));
    } catch {
      return '-';
    }
  }
  return '-';
}

export default function MotherDetailsPage({ params }: MotherDetailsPageProps) {
  const [motherId, setMotherId] = useState('');
  const [loading, setLoading] = useState(true);
  const [mother, setMother] = useState<MotherSummary>(emptyMother);
  const [ancHistory, setAncHistory] = useState<HistoryRow[]>([]);
  const [pncHistory, setPncHistory] = useState<HistoryRow[]>([]);
  const [childHistory, setChildHistory] = useState<HistoryRow[]>([]);

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
          const data = motherDoc.data() as Record<string, unknown>;
          const firstName = toLabel(data.firstName ?? data.first_name, '');
          const lastName = toLabel(data.lastName ?? data.last_name, '');
          const fullName = `${firstName} ${lastName}`.trim();

          setMother({
            id,
            name: fullName || toLabel(data.full_name ?? data.name, 'Unknown Mother'),
            phone: toLabel(data.phone),
            status: toLabel(data.status ?? data.maternalStatus ?? data.stage, 'UNKNOWN'),
            edd: toLabel(data.edd ?? data.expectedDeliveryDate ?? data.expected_delivery_date),
          });
        }

        const [appointmentsSnapshot, maternalSnapshot, childrenSnapshot, growthSnapshot, immunizationSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'appointments')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'growthRecords')),
            getDocs(collection(firebaseDb, 'immunizations')),
          ]);

        const appointmentRows = appointmentsSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => toLabel(row.motherId ?? row.mother_id, '') === id);

        const maternalRows = maternalSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => toLabel(row.motherId ?? row.mother_id, '') === id);

        const ancFromMaternal = maternalRows
          .filter((row) => {
            const type = toLabel(row.recordType ?? row.type, '').toUpperCase();
            return type.includes('ANC') || type.includes('ANTENATAL');
          })
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.visitDate ?? row.date ?? row.createdAt),
            source: 'Maternal Record',
            details: toLabel(row.notes ?? row.clinicalObservations ?? row.plan, 'ANC notes'),
            status: toLabel(row.status, 'Recorded'),
          }));

        const ancFromAppointments = appointmentRows
          .filter((row) => {
            const type = toLabel(row.appointmentType ?? row.type ?? row.reason, '').toUpperCase();
            return type.includes('ANC') || type.includes('ANTENATAL') || type.includes('PRENATAL');
          })
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.dateTime ?? row.date ?? row.createdAt),
            source: 'Appointment',
            details: toLabel(row.reason ?? row.notes, 'ANC appointment'),
            status: toLabel(row.status, 'Pending'),
          }));

        const pncFromMaternal = maternalRows
          .filter((row) => {
            const type = toLabel(row.recordType ?? row.type, '').toUpperCase();
            return type.includes('PNC') || type.includes('POSTNATAL');
          })
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.visitDate ?? row.date ?? row.createdAt),
            source: 'Maternal Record',
            details: toLabel(row.notes ?? row.clinicalObservations ?? row.plan, 'PNC notes'),
            status: toLabel(row.status, 'Recorded'),
          }));

        const pncFromAppointments = appointmentRows
          .filter((row) => {
            const type = toLabel(row.appointmentType ?? row.type ?? row.reason, '').toUpperCase();
            return type.includes('PNC') || type.includes('POSTNATAL');
          })
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.dateTime ?? row.date ?? row.createdAt),
            source: 'Appointment',
            details: toLabel(row.reason ?? row.notes, 'PNC appointment'),
            status: toLabel(row.status, 'Pending'),
          }));

        const children = childrenSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => toLabel(row.motherId ?? row.mother_id, '') === id);

        const childIds = new Set(children.map((child) => child.id));

        const childFromGrowth = growthSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => childIds.has(toLabel(row.childId ?? row.child_id, '')))
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.recordedDate ?? row.date ?? row.createdAt),
            source: 'Growth Record',
            details: toLabel(row.notes, 'Child growth follow-up'),
            status: 'Recorded',
          }));

        const childFromImmunization = immunizationSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => childIds.has(toLabel(row.childId ?? row.child_id, '')))
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.givenDate ?? row.date ?? row.createdAt),
            source: 'Immunization',
            details: `${toLabel(row.vaccine ?? row.vaccineName, 'Vaccine')} - ${toLabel(row.schedule ?? row.dose, '-')}`,
            status: toLabel(row.status, 'Due'),
          }));

        if (isMounted) {
          setAncHistory([...ancFromMaternal, ...ancFromAppointments]);
          setPncHistory([...pncFromMaternal, ...pncFromAppointments]);
          setChildHistory([...childFromGrowth, ...childFromImmunization]);
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

  const summaryText = useMemo(() => {
    return `ANC: ${ancHistory.length} | PNC: ${pncHistory.length} | Child: ${childHistory.length}`;
  }, [ancHistory.length, childHistory.length, pncHistory.length]);

  const statusUpper = mother.status.trim().toUpperCase();
  const isPrenatal = statusUpper.includes('PRENATAL') || statusUpper.includes('PREG');
  const isPostnatal = statusUpper.includes('POSTNATAL') || statusUpper.includes('POST NATAL') || statusUpper.includes('PNC');
  const showAncAction = isPrenatal || (!isPrenatal && !isPostnatal);
  const showPostnatalActions = isPostnatal;

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">Mother Details</h1>
          <p className="page-subtitle">History and visit actions for ANC, PNC, and Child follow-up.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {showAncAction ? <Link href={`/records/anc/${motherId}`} className="btn btn-primary">+ Add ANC Visit</Link> : null}
          {showPostnatalActions ? <Link href={`/records/mother/${motherId}`} className="btn btn-secondary">+ Add PNC Visit</Link> : null}
          {showPostnatalActions ? <Link href={`/records/child/${motherId}`} className="btn btn-secondary">+ Add Child Visit</Link> : null}
        </div>
      </div>

      <div className="content-card card-spaced">
        <div className="card-header">
          <span>Mother Overview</span>
        </div>
        {loading ? (
          <p>Loading mother history...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>ID: {mother.id}</div>
            <div>Name: {mother.name}</div>
            <div>Phone: {mother.phone}</div>
            <div>Status: {mother.status}</div>
            <div>Estimated Delivery: {mother.edd}</div>
            <div>{summaryText}</div>
          </div>
        )}
      </div>

      {showAncAction ? (
        <div className="content-card card-spaced">
          <div className="card-header">
            <span>ANC History</span>
            <Link href={`/records/anc/${motherId}`} className="btn btn-secondary btn-compact">
              Open ANC
            </Link>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Loading ANC history...</td>
                  </tr>
                ) : ancHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No ANC history found.</td>
                  </tr>
                ) : (
                  ancHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.source}</td>
                      <td>{row.details}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showPostnatalActions ? (
        <div className="content-card card-spaced">
          <div className="card-header">
            <span>PNC History</span>
            <Link href={`/records/mother/${motherId}`} className="btn btn-secondary btn-compact">
              Open PNC
            </Link>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Loading PNC history...</td>
                  </tr>
                ) : pncHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No PNC history found.</td>
                  </tr>
                ) : (
                  pncHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.source}</td>
                      <td>{row.details}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showPostnatalActions ? (
        <div className="content-card">
          <div className="card-header">
            <span>Child Progress History</span>
            <Link href={`/records/child/${motherId}`} className="btn btn-secondary btn-compact">
              Open Child Record
            </Link>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Loading child history...</td>
                  </tr>
                ) : childHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No child progress history found.</td>
                  </tr>
                ) : (
                  childHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.source}</td>
                      <td>{row.details}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </main>
  );
}
