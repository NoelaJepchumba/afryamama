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
  childName: string;
  childDob: string;
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
  childName: '-',
  childDob: '-',
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function sameId(left: unknown, right: unknown): boolean {
  const a = asText(left).toLowerCase();
  const b = asText(right).toLowerCase();
  return Boolean(a && b && a === b);
}

function sameText(left: unknown, right: unknown): boolean {
  return sameId(left, right);
}

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

function parseDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function computeEddFromLmp(data: Record<string, unknown>): string {
  const lmp = parseDate(data.lmp ?? data.lmpDate ?? data.lastMenstrualPeriod ?? data.last_menstrual_period);
  if (!lmp) return '-';
  const due = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

function computeEddFromGestation(
  maternalRows: Array<Record<string, unknown>>,
  appointmentRows: Array<Record<string, unknown>>
): string {
  const ancCandidates = [
    ...maternalRows.filter((row) => toLabel(row.recordType ?? row.type, '').toUpperCase().includes('ANC')),
    ...appointmentRows.filter((row) => {
      const type = toLabel(row.appointmentType ?? row.type ?? row.reason, '').toUpperCase();
      return type.includes('ANC') || type.includes('ANTENATAL') || type.includes('PRENATAL');
    }),
  ];

  for (const row of ancCandidates) {
    const gestWeeksRaw = row.gestationWeeks ?? row.gestation ?? row.weeks;
    const gestWeeks = typeof gestWeeksRaw === 'number' ? gestWeeksRaw : Number(gestWeeksRaw);
    const visitDate = parseDate(row.visitDate ?? row.date ?? row.dateTime ?? row.createdAt);

    if (!Number.isNaN(gestWeeks) && gestWeeks > 0 && visitDate) {
      const remainingWeeks = Math.max(0, 40 - gestWeeks);
      const due = new Date(visitDate.getTime() + remainingWeeks * 7 * 24 * 60 * 60 * 1000);
      return due.toISOString().slice(0, 10);
    }
  }

  return '-';
}

function computeEddFromPregnancies(pregnancyRows: Array<Record<string, unknown>>): string {
  for (const row of pregnancyRows) {
    const stored = toDateLabel(
      row.estimatedDueDate ?? row.expectedDueDate ?? row.dueDate ?? row.edd ?? row.expected_delivery_date
    );
    if (stored !== '-') return stored;

    const lmp = parseDate(row.lmp ?? row.lmpDate ?? row.lastMenstrualPeriod ?? row.last_menstrual_period);
    if (lmp) {
      const due = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);
      return due.toISOString().slice(0, 10);
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
        let motherNameCandidates: string[] = [];
        let motherPhone = '';
        let motherData: Record<string, unknown> = {};

        if (motherDoc.exists()) {
          const data = motherDoc.data() as Record<string, unknown>;
          motherData = data;
          const firstName = toLabel(data.firstName ?? data.first_name, '');
          const lastName = toLabel(data.lastName ?? data.last_name, '');
          const fullName = `${firstName} ${lastName}`.trim();
          motherNameCandidates = [
            fullName,
            toLabel(data.full_name ?? data.name, ''),
            asText(data.displayName),
          ].filter((value) => value.length > 0);
          motherPhone = asText(data.phone);

          setMother({
            id,
            name: fullName || toLabel(data.full_name ?? data.name, 'Unknown Mother'),
            phone: toLabel(data.phone),
            status: toLabel(data.status ?? data.maternalStatus ?? data.stage, 'UNKNOWN'),
            edd: toLabel(data.edd ?? data.expectedDeliveryDate ?? data.expected_delivery_date),
            childName: '-',
            childDob: '-',
          });
        }

        const [appointmentsSnapshot, maternalSnapshot, pncSnapshot, pregnanciesSnapshot, childrenSnapshot, childSnapshot, growthSnapshot, immunizationSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'appointments')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'pncRecords')),
            getDocs(collection(firebaseDb, 'pregnancies')),
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'child')),
            getDocs(collection(firebaseDb, 'growthRecords')),
            getDocs(collection(firebaseDb, 'immunizations')),
          ]);

        const appointmentRows = appointmentsSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => toLabel(row.motherId ?? row.mother_id, '') === id);

        const maternalRows = maternalSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => toLabel(row.motherId ?? row.mother_id, '') === id);

        const pregnancyRows = pregnanciesSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => sameId(row.motherId ?? row.mother_id, id));

        const computedEdd = (() => {
          const fromStored = motherData
            ? toLabel(
                motherData.edd ??
                  motherData.expectedDeliveryDate ??
                  motherData.expected_delivery_date ??
                  motherData.estimatedDueDate ??
                  motherData.dueDate,
                '-'
              )
            : '-';
          if (fromStored !== '-') return fromStored;

          const fromLmp = computeEddFromLmp(motherData);
          if (fromLmp !== '-') return fromLmp;

          const fromPregnancy = computeEddFromPregnancies(pregnancyRows);
          if (fromPregnancy !== '-') return fromPregnancy;

          return computeEddFromGestation(maternalRows, appointmentRows);
        })();

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

        const pncFromRecords = pncSnapshot.docs
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter((row) => sameId(row.motherId ?? row.mother_id, id))
          .map((row) => ({
            id: row.id,
            date: toDateLabel(row.checkupDate ?? row.visitDate ?? row.date ?? row.createdAt),
            source: 'PNC Record',
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

        const children = [...childrenSnapshot.docs, ...childSnapshot.docs]
          .map((docItem) => ({ id: docItem.id, ...(docItem.data() as Record<string, unknown>) }))
          .filter(
            (row) =>
              sameId(row.motherId, id) ||
              sameId(row.mother_id, id) ||
              sameId(row.motherDocId, id) ||
              sameId(row.parentId, id) ||
              sameId(row.motherRef, id) ||
              motherNameCandidates.some((name) =>
                sameText(row.motherName, name) ||
                sameText(row.motherFullName, name) ||
                sameText(row.parentName, name)
              ) ||
              (motherPhone ? sameText(row.motherPhone, motherPhone) || sameText(row.parentPhone, motherPhone) : false)
          );

        const childNames = children
          .map((row) => asText(row.fullName ?? row.name ?? row.full_name ?? row.childName))
          .filter((name) => name.length > 0);
        const childDob = children.length
          ? toDateLabel(children[0].birthDate ?? children[0].dateOfBirth ?? children[0].dob ?? children[0].date_of_birth)
          : '-';

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
          setMother((prev) => ({
            ...prev,
            edd: computedEdd,
            childName: childNames.length ? childNames.join(', ') : '-',
            childDob,
          }));
          setAncHistory(ancFromMaternal);
          setPncHistory([...pncFromMaternal, ...pncFromRecords, ...pncFromAppointments]);
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

  const statusUpper = mother.status.trim().toUpperCase();
  const isPrenatal = statusUpper.includes('PRENATAL') || statusUpper.includes('PREG');
  const isPostnatal = statusUpper.includes('POSTNATAL') || statusUpper.includes('POST NATAL') || statusUpper.includes('PNC');
  const showAncAction = isPrenatal || (!isPrenatal && !isPostnatal);
  const showPostnatalActions = isPostnatal;

  const summaryText = useMemo(() => {
    if (showPostnatalActions) {
      return `PNC: ${pncHistory.length} | Child: ${childHistory.length}`;
    }
    return `ANC: ${ancHistory.length}`;
  }, [ancHistory.length, childHistory.length, pncHistory.length, showPostnatalActions]);

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
            {isPostnatal ? <div>Child: {mother.childName}</div> : null}
            {isPostnatal ? <div>Child DOB: {mother.childDob}</div> : null}
            <div>Phone: {mother.phone}</div>
            <div>Status: {mother.status}</div>
            {!isPostnatal ? <div>Estimated Delivery: {mother.edd}</div> : null}
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
