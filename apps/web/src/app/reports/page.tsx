'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

type Series = {
  name: string;
  color: string;
  values: number[];
};

type ChartModel = {
  id: string;
  title: string;
  subtitle: string;
  labels: string[];
  series: Series[];
};

type SummaryMetric = {
  label: string;
  value: string;
  detail: string;
};

function asLabel(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function getRecentMonthKeys(count: number): string[] {
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

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  const escaped = text.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function downloadReportsCsv(filename: string, charts: ChartModel[], summary: SummaryMetric[]) {
  const lines: string[] = [];

  lines.push('AfyaMama Report Summary');
  lines.push('Metric,Value,Detail');
  summary.forEach((item) => {
    lines.push([escapeCsv(item.label), escapeCsv(item.value), escapeCsv(item.detail)].join(','));
  });

  charts.forEach((chart) => {
    lines.push('');
    lines.push(escapeCsv(chart.title));
    lines.push(escapeCsv(chart.subtitle));
    lines.push(['Month', ...chart.series.map((line) => line.name)].map(escapeCsv).join(','));

    chart.labels.forEach((label, index) => {
      const row = [label, ...chart.series.map((line) => line.values[index] ?? 0)];
      lines.push(row.map(escapeCsv).join(','));
    });
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadSvgAsPng(svgElement: SVGSVGElement, filename: string) {
  const serializer = new XMLSerializer();
  const cloned = svgElement.cloneNode(true) as SVGSVGElement;

  // Ensure exported text colors are preserved outside the app CSS context.
  cloned.querySelectorAll('text').forEach((node) => {
    node.setAttribute('fill', '#64748b');
  });

  const source = serializer.serializeToString(cloned);
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const viewWidth = Number(svgElement.viewBox.baseVal.width) || 760;
    const viewHeight = Number(svgElement.viewBox.baseVal.height) || 240;
    const canvas = document.createElement('canvas');
    canvas.width = viewWidth;
    canvas.height = viewHeight;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngUrl = canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = pngUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadAllChartsAsPng(charts: ChartModel[]) {
  for (const chart of charts) {
    const svg = document.querySelector<SVGSVGElement>(`svg[data-chart-id="${chart.id}"]`);
    if (!svg) continue;

    const safeName = chart.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await downloadSvgAsPng(svg, `${safeName || chart.id}.png`);
  }
}

function LineChart({ chart }: { chart: ChartModel }) {
  const width = 760;
  const height = 240;
  const paddingX = 44;
  const paddingY = 22;
  const maxValue = Math.max(1, ...chart.series.flatMap((line) => line.values));

  const toPoint = (index: number, value: number) => {
    const xSpan = width - paddingX * 2;
    const ySpan = height - paddingY * 2;
    const x = paddingX + (xSpan * index) / Math.max(chart.labels.length - 1, 1);
    const y = height - paddingY - (value / maxValue) * ySpan;
    return `${x},${y}`;
  };

  return (
    <div className="content-card" key={chart.id}>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span>{chart.title}</span>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>{chart.subtitle}</p>

      <svg
        data-chart-id={chart.id}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={chart.title}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const y = paddingY + ((height - paddingY * 2) * i) / 4;
          return (
            <line
              key={`grid-${chart.id}-${i}`}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="4 4"
            />
          );
        })}

        {chart.series.map((line) => (
          <polyline
            key={`${chart.id}-${line.name}`}
            fill="none"
            stroke={line.color}
            strokeWidth="3"
            points={line.values.map((value, index) => toPoint(index, value)).join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {chart.labels.map((label, index) => {
          const xSpan = width - paddingX * 2;
          const x = paddingX + (xSpan * index) / Math.max(chart.labels.length - 1, 1);
          return (
            <text key={`${chart.id}-${label}`} x={x} y={height - 4} textAnchor="middle" fontSize="11" fill="#64748b">
              {label}
            </text>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        {chart.series.map((line) => (
          <div key={`${chart.id}-legend-${line.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: line.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [charts, setCharts] = useState<ChartModel[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<SummaryMetric[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadAnalytics() {
      try {
        const [mothersSnapshot, childrenSnapshot, immunizationSnapshot, maternalSnapshot, appointmentsSnapshot, pregnanciesSnapshot, ancSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'mothers')),
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'immunizations')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'appointments')),
            getDocs(collection(firebaseDb, 'pregnancies')),
            getDocs(collection(firebaseDb, 'anc_records')),
          ]);

        const keys = getRecentMonthKeys(6);
        const labels = keys.map(toMonthLabel);

        const ancCounts = emptyCounts(keys);
        const pncCounts = emptyCounts(keys);
        const motherCounts = emptyCounts(keys);
        const childCounts = emptyCounts(keys);
        const appointmentCounts = emptyCounts(keys);
        const notificationCounts = emptyCounts(keys);
        const immunizationCounts = emptyCounts(keys);
        const highRiskCounts = emptyCounts(keys);

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
          pushCount(childCounts, data.createdAt ?? data.created_at ?? data.date ?? data.birthDate);
        });

        immunizationSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const status = asLabel(data.status, '').toLowerCase();
          if (status === 'completed' || status === 'done' || status === 'given') {
            pushCount(immunizationCounts, data.givenDate ?? data.date ?? data.createdAt);
          }
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

        ancSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(ancCounts, data.date ?? data.createdAt ?? data.created_at ?? data.checkupDate);
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

        const highRiskReferrals = pregnanciesSnapshot.docs.filter((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const risk = asLabel(data.riskLevel ?? data.risk ?? data.status, '').toLowerCase();
          const referral = asLabel(data.referralStatus ?? data.referral, '').toLowerCase();
          return risk.includes('high') || referral.includes('referred');
        });

        pregnanciesSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const risk = asLabel(data.riskLevel ?? data.risk ?? data.status, '').toLowerCase();
          const referral = asLabel(data.referralStatus ?? data.referral, '').toLowerCase();
          if (risk.includes('high') || referral.includes('referred')) {
            pushCount(highRiskCounts, data.createdAt ?? data.updatedAt ?? data.date);
          }
        });

        const notificationsSnapshot = await getDocs(collection(firebaseDb, 'notifications'));
        notificationsSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          pushCount(notificationCounts, data.sentAt ?? data.createdAt ?? data.date);
        });

        const chartsData: ChartModel[] = [
          {
            id: 'care-visits',
            title: 'Maternal Care Visits Trend',
            subtitle: 'Monthly ANC and PNC records and appointments.',
            labels,
            series: [
              { name: 'ANC', color: '#2563eb', values: keys.map((key) => ancCounts[key]) },
              { name: 'PNC', color: '#db2777', values: keys.map((key) => pncCounts[key]) },
            ],
          },
          {
            id: 'registrations',
            title: 'Mother & Child Registration Trend',
            subtitle: 'Monthly registrations for mothers and children.',
            labels,
            series: [
              { name: 'Mothers', color: '#7c3aed', values: keys.map((key) => motherCounts[key]) },
              { name: 'Children', color: '#0891b2', values: keys.map((key) => childCounts[key]) },
            ],
          },
          {
            id: 'operations',
            title: 'Operational Activity Trend',
            subtitle: 'Appointments and notifications sent over time.',
            labels,
            series: [
              { name: 'Appointments', color: '#ea580c', values: keys.map((key) => appointmentCounts[key]) },
              { name: 'Notifications', color: '#16a34a', values: keys.map((key) => notificationCounts[key]) },
            ],
          },
          {
            id: 'outcomes',
            title: 'Clinical Outcomes Trend',
            subtitle: `High-risk referrals total: ${highRiskReferrals}. Completed immunizations are shown monthly.`,
            labels,
            series: [
              { name: 'Completed Immunizations', color: '#0d9488', values: keys.map((key) => immunizationCounts[key]) },
              { name: 'High-Risk Referrals', color: '#dc2626', values: keys.map((key) => highRiskCounts[key]) },
            ],
          },
        ];

        if (isMounted) {
          setCharts(chartsData);
          const currentKey = keys[keys.length - 1];
          const totalAnc = keys.reduce((sum, key) => sum + ancCounts[key], 0);
          const totalPnc = keys.reduce((sum, key) => sum + pncCounts[key], 0);
          const totalAppointments = keys.reduce((sum, key) => sum + appointmentCounts[key], 0);
          const totalImmunizations = keys.reduce((sum, key) => sum + immunizationCounts[key], 0);
          const totalHighRisk = keys.reduce((sum, key) => sum + highRiskCounts[key], 0);

          setSummaryMetrics([
            {
              label: 'Total ANC Visits (6 months)',
              value: String(totalAnc),
              detail: `${ancCounts[currentKey]} recorded in ${toMonthLabel(currentKey)}`,
            },
            {
              label: 'Total PNC Visits (6 months)',
              value: String(totalPnc),
              detail: `${pncCounts[currentKey]} recorded in ${toMonthLabel(currentKey)}`,
            },
            {
              label: 'Appointments Logged',
              value: String(totalAppointments),
              detail: `${appointmentCounts[currentKey]} in the latest month`,
            },
            {
              label: 'Completed Immunizations',
              value: String(totalImmunizations),
              detail: `${immunizationCounts[currentKey]} completed in the latest month`,
            },
            {
              label: 'High-Risk Referrals',
              value: String(totalHighRisk),
              detail: `${highRiskCounts[currentKey]} identified in the latest month`,
            },
          ]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, []);

  const chartViews = useMemo(() => charts.map((chart) => <LineChart key={chart.id} chart={chart} />), [charts]);

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">Health Reports & Analytics</h1>
          <p className="page-subtitle">All report outputs are shown as line graphs, including ANC and PNC trends.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => void downloadAllChartsAsPng(charts)}
            disabled={loading || charts.length === 0}
          >
            Download Charts (PNG)
          </button>
          <button
            className="btn btn-primary"
            onClick={() => downloadReportsCsv('doctor-reports.csv', charts, summaryMetrics)}
            disabled={loading || charts.length === 0}
          >
            Download CSV
          </button>
        </div>
      </div>

      {loading ? <div className="content-card">Loading report analytics from Firestore...</div> : (
        <>
          <div
            className="content-card"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}
          >
            {summaryMetrics.map((item) => (
              <div key={item.label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary-color)' }}>{item.value}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.detail}</div>
              </div>
            ))}
          </div>
          {chartViews}
        </>
      )}
    </main>
  );
}
