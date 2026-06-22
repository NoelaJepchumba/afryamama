'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

interface ReportMetric {
  immunizationCoverage: number;
  healthyWeightBirths: number;
  completedAncPackages: number;
  highRiskReferrals: number;
}

interface AuditRow {
  id: string;
  reportName: string;
  reportingWindow: string;
  generatedDate: string;
  fileSize: string;
  format: 'CSV' | 'PDF';
}

const emptyMetrics: ReportMetric = {
  immunizationCoverage: 0,
  healthyWeightBirths: 0,
  completedAncPackages: 0,
  highRiskReferrals: 0,
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

function toWindowLabel(dates: Date[]): string {
  if (dates.length === 0) return 'No date range available';
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const start = sorted[0].toISOString().slice(0, 10);
  const end = sorted[sorted.length - 1].toISOString().slice(0, 10);
  return `${start} to ${end}`;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ReportMetric>(emptyMetrics);
  const [audits, setAudits] = useState<AuditRow[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadAnalytics() {
      try {
        const [childrenSnapshot, growthSnapshot, immunizationSnapshot, maternalSnapshot, appointmentsSnapshot, pregnanciesSnapshot] =
          await Promise.all([
            getDocs(collection(firebaseDb, 'children')),
            getDocs(collection(firebaseDb, 'growthRecords')),
            getDocs(collection(firebaseDb, 'immunizations')),
            getDocs(collection(firebaseDb, 'maternalRecords')),
            getDocs(collection(firebaseDb, 'appointments')),
            getDocs(collection(firebaseDb, 'pregnancies')),
          ]);

        const immunizationRows = immunizationSnapshot.docs.map((d) => d.data() as Record<string, unknown>);
        const completedImmunizations = immunizationRows.filter((row) => {
          const status = asLabel(row.status, '').toLowerCase();
          return status === 'completed' || status === 'done' || status === 'given';
        }).length;
        const immunizationCoverage =
          immunizationRows.length > 0 ? (completedImmunizations / immunizationRows.length) * 100 : 0;

        const growthByChildId = new Map<string, Record<string, unknown>>();
        growthSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const childId = asLabel(data.childId ?? data.child_id, '');
          if (!childId || growthByChildId.has(childId)) return;
          growthByChildId.set(childId, data);
        });

        const healthyWeightCount = childrenSnapshot.docs.filter((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const growth = growthByChildId.get(docItem.id);
          const weight = asNumber(growth?.weight ?? data.birthWeight ?? data.weight);
          return weight !== null && weight >= 2.5;
        }).length;
        const healthyWeightBirths =
          childrenSnapshot.size > 0 ? (healthyWeightCount / childrenSnapshot.size) * 100 : 0;

        const ancContactsByMother = new Map<string, number>();
        maternalSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          if (inferType(data) !== 'ANC') return;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          if (!motherId) return;
          ancContactsByMother.set(motherId, (ancContactsByMother.get(motherId) || 0) + 1);
        });
        appointmentsSnapshot.docs.forEach((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          if (inferType(data) !== 'ANC') return;
          const motherId = asLabel(data.motherId ?? data.mother_id, '');
          if (!motherId) return;
          ancContactsByMother.set(motherId, (ancContactsByMother.get(motherId) || 0) + 1);
        });
        const mothersWithFourPlusAnc = Array.from(ancContactsByMother.values()).filter((n) => n >= 4).length;
        const completedAncPackages =
          ancContactsByMother.size > 0 ? (mothersWithFourPlusAnc / ancContactsByMother.size) * 100 : 0;

        const highRiskReferrals = pregnanciesSnapshot.docs.filter((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const risk = asLabel(data.riskLevel ?? data.risk ?? data.status, '').toLowerCase();
          const referral = asLabel(data.referralStatus ?? data.referral, '').toLowerCase();
          return risk.includes('high') || referral.includes('referred');
        }).length;

        const maternalDates = maternalSnapshot.docs
          .map((d) => d.data() as Record<string, unknown>)
          .map((row) => asDate(row.checkupDate ?? row.visitDate ?? row.date ?? row.recordedDate))
          .filter((d): d is Date => d !== null);

        const immunizationDates = immunizationRows
          .map((row) => asDate(row.givenDate ?? row.date ?? row.createdAt))
          .filter((d): d is Date => d !== null);

        const pregnancyDates = pregnanciesSnapshot.docs
          .map((d) => d.data() as Record<string, unknown>)
          .map((row) => asDate(row.createdAt ?? row.updatedAt ?? row.date))
          .filter((d): d is Date => d !== null);

        const today = new Date().toISOString().slice(0, 10);
        const generatedAudits: AuditRow[] = [
          {
            id: 'anc-register',
            reportName: 'Antenatal Care Attendance Register',
            reportingWindow: toWindowLabel(maternalDates),
            generatedDate: today,
            fileSize: `${Math.max(48, maternalSnapshot.size * 2)} KB`,
            format: 'CSV',
          },
          {
            id: 'vaccine-coverage',
            reportName: 'Infant Vaccination Coverage Report',
            reportingWindow: toWindowLabel(immunizationDates),
            generatedDate: today,
            fileSize: `${Math.max(64, immunizationSnapshot.size * 3)} KB`,
            format: 'CSV',
          },
          {
            id: 'maternal-indicator',
            reportName: 'Maternal Health Indicator Audit',
            reportingWindow: toWindowLabel(pregnancyDates),
            generatedDate: today,
            fileSize: `${Math.max(180, pregnanciesSnapshot.size * 6)} KB`,
            format: 'PDF',
          },
        ];

        if (isMounted) {
          setMetrics({
            immunizationCoverage,
            healthyWeightBirths,
            completedAncPackages,
            highRiskReferrals,
          });
          setAudits(generatedAudits);
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

  const coverageLabel = useMemo(() => `${metrics.immunizationCoverage.toFixed(1)}%`, [metrics.immunizationCoverage]);
  const birthWeightLabel = useMemo(() => `${metrics.healthyWeightBirths.toFixed(1)}%`, [metrics.healthyWeightBirths]);
  const ancPackageLabel = useMemo(() => `${metrics.completedAncPackages.toFixed(1)}%`, [metrics.completedAncPackages]);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Health Reports & Analytics</h1>
            <p className="page-subtitle">Export clinical aggregates, track immunization coverages, and review birth outcomes.</p>
          </div>
          <div>
            <button className="btn btn-primary" disabled={loading}>Generate Custom Audit</button>
          </div>
        </div>

        <div className="card-grid">
          <div className="stat-card">
            <span className="stat-title">Immunization Coverage</span>
            <div className="stat-value">{loading ? '...' : coverageLabel}</div>
            <span className="stat-desc">
              National target: 90%
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-title">Healthy Weight Births</span>
            <div className="stat-value">{loading ? '...' : birthWeightLabel}</div>
            <span className="stat-desc">
              Birth weight &gt;= 2.5kg
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-title">Completed ANC Packages</span>
            <div className="stat-value">{loading ? '...' : ancPackageLabel}</div>
            <span className="stat-desc">
              4+ prenatal consultations
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-title">High Risk Referrals</span>
            <div className="stat-value">{loading ? '...' : metrics.highRiskReferrals.toLocaleString()}</div>
            <span className="stat-desc">
              Currently monitored
            </span>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>Downloadable Audits & Registers</span>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Report Name</th>
                  <th>Reporting Window</th>
                  <th>Generated Date</th>
                  <th>File Size</th>
                  <th>Format</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>Loading report analytics from Firestore...</td>
                  </tr>
                ) : audits.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No report datasets found.</td>
                  </tr>
                ) : (
                  audits.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: '600' }}>{row.reportName}</td>
                      <td>{row.reportingWindow}</td>
                      <td>{row.generatedDate}</td>
                      <td>{row.fileSize}</td>
                      <td>
                        <span
                          className="badge badge-success"
                          style={
                            row.format === 'PDF'
                              ? { color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }
                              : { color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', backgroundColor: 'rgba(16, 185, 129, 0.05)' }
                          }
                        >
                          {row.format}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                          Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
  );
}
