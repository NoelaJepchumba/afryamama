'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';

type Series = { name: string; color: string; values: number[] };
type GraphModel = { id: string; title: string; subtitle: string; labels: string[]; series: Series[] };

function asLabel(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function inferType(data: Record<string, unknown>): 'ANC' | 'PNC' | 'OTHER' {
  const txt = asLabel(data.type ?? data.appointmentType ?? data.visitType ?? data.recordType, '').toUpperCase();
  if (txt.includes('ANC') || txt.includes('ANTENATAL')) return 'ANC';
  if (txt.includes('PNC') || txt.includes('POSTNATAL')) return 'PNC';
  return 'OTHER';
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toMonthLabel(key: string): string {
  const [yearText, monthText] = key.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString([], { month: 'short', year: '2-digit' });
}

function recentMonthKeys(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return monthKey(d);
  });
}

function emptyCounts(keys: string[]): Record<string, number> {
  return keys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function LineChart({ graph }: { graph: GraphModel }) {
  const width = 760;
  const height = 240;
  const padX = 44;
  const padY = 22;
  const maxValue = Math.max(1, ...graph.series.flatMap((line) => line.values));

  const point = (index: number, value: number) => {
    const xSpan = width - padX * 2;
    const ySpan = height - padY * 2;
    const x = padX + (xSpan * index) / Math.max(graph.labels.length - 1, 1);
    const y = height - padY - (value / maxValue) * ySpan;
    return `${x},${y}`;
  };

  return (
    <div className="content-card" key={graph.id}>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span>{graph.title}</span>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>{graph.subtitle}</p>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {Array.from({ length: 5 }, (_, i) => {
          const y = padY + ((height - padY * 2) * i) / 4;
          return (
            <line
              key={`${graph.id}-grid-${i}`}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="4 4"
            />
          );
        })}

        {graph.series.map((line) => (
          <polyline
            key={`${graph.id}-${line.name}`}
            fill="none"
            stroke={line.color}
            strokeWidth="3"
            points={line.values.map((value, index) => point(index, value)).join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {graph.labels.map((label, index) => {
          const xSpan = width - padX * 2;
          const x = padX + (xSpan * index) / Math.max(graph.labels.length - 1, 1);
          return (
            <text key={`${graph.id}-label-${label}`} x={x} y={height - 4} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {label}
            </text>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        {graph.series.map((line) => (
          <div key={`${graph.id}-legend-${line.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: line.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminReportsPage() {
  const [graphs, setGraphs] = useState<GraphModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReports() {
      try {
        const [mothersSnapshot, childrenSnapshot, ancSnapshot, maternalSnapshot, appointmentsSnapshot, notificationsSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'children')),
          getDocs(collection(firebaseDb, 'anc_records')),
          getDocs(collection(firebaseDb, 'maternalRecords')),
          getDocs(collection(firebaseDb, 'appointments')),
          getDocs(collection(firebaseDb, 'notifications')),
        ]);

        const keys = recentMonthKeys(6);
        const labels = keys.map(toMonthLabel);
        const ancCounts = emptyCounts(keys);
        const pncCounts = emptyCounts(keys);
        const motherCounts = emptyCounts(keys);
        const childCounts = emptyCounts(keys);
        const appointmentCounts = emptyCounts(keys);
        const notificationCounts = emptyCounts(keys);

        const pushCount = (bucket: Record<string, number>, dateValue: unknown) => {
          const d = asDate(dateValue);
          if (!d) return;
          const key = monthKey(d);
          if (key in bucket) bucket[key] += 1;
        };

        mothersSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(motherCounts, data.createdAt ?? data.created_at ?? data.date);
        });

        childrenSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(childCounts, data.createdAt ?? data.created_at ?? data.date);
        });

        ancSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(ancCounts, data.date ?? data.createdAt ?? data.created_at ?? data.checkupDate);
        });

        maternalSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const type = inferType(data);
          if (type === 'ANC') {
            pushCount(ancCounts, data.checkupDate ?? data.visitDate ?? data.date ?? data.recordedDate);
          }
          if (type === 'PNC') {
            pushCount(pncCounts, data.checkupDate ?? data.visitDate ?? data.date ?? data.recordedDate);
          }
        });

        appointmentsSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const type = inferType(data);
          if (type === 'ANC') {
            pushCount(ancCounts, data.dateTime ?? data.appointmentTime ?? data.date);
          }
          if (type === 'PNC') {
            pushCount(pncCounts, data.dateTime ?? data.appointmentTime ?? data.date);
          }
          pushCount(appointmentCounts, data.dateTime ?? data.appointmentTime ?? data.date);
        });

        notificationsSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(notificationCounts, data.sentAt ?? data.createdAt ?? data.date);
        });

        const nextGraphs: GraphModel[] = [
          {
            id: 'maternal-care',
            title: 'Maternal Care Trend (ANC vs PNC)',
            subtitle: 'Monthly trend for ANC and PNC records/appointments.',
            labels,
            series: [
              { name: 'ANC', color: '#2563eb', values: keys.map((key) => ancCounts[key]) },
              { name: 'PNC', color: '#db2777', values: keys.map((key) => pncCounts[key]) },
            ],
          },
          {
            id: 'registry',
            title: 'Registry Growth Trend',
            subtitle: 'Monthly growth of mothers and children in the system.',
            labels,
            series: [
              { name: 'Mothers', color: '#7c3aed', values: keys.map((key) => motherCounts[key]) },
              { name: 'Children', color: '#0891b2', values: keys.map((key) => childCounts[key]) },
            ],
          },
          {
            id: 'operations',
            title: 'Operations Trend',
            subtitle: 'Monthly appointments and notifications.',
            labels,
            series: [
              { name: 'Appointments', color: '#ea580c', values: keys.map((key) => appointmentCounts[key]) },
              { name: 'Notifications', color: '#16a34a', values: keys.map((key) => notificationCounts[key]) },
            ],
          },
        ];

        setGraphs(nextGraphs);
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const graphViews = useMemo(() => graphs.map((graph) => <LineChart key={graph.id} graph={graph} />), [graphs]);

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">System Reports</h1>
          <p className="page-subtitle">All report views are rendered as line graphs, including ANC and PNC.</p>
        </div>
      </div>

      {loading ? <div className="content-card">Loading reports from Firestore...</div> : graphViews}
    </main>
  );
}
