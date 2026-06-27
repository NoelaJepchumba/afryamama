'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

interface MotherRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: string;
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

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeRows(rows: MotherRow[]): MotherRow[] {
  const byEmail = new Map<string, MotherRow>();
  const passthrough: MotherRow[] = [];

  for (const row of rows) {
    const normalizedEmail = normalizeValue(row.email);
    if (!normalizedEmail) {
      passthrough.push(row);
      continue;
    }

    const current = byEmail.get(normalizedEmail);

    if (!current) {
      byEmail.set(normalizedEmail, row);
      continue;
    }

    const currentScore = [current.name, current.phone, current.location, current.status].filter((value) => value && value !== '-').length;
    const nextScore = [row.name, row.phone, row.location, row.status].filter((value) => value && value !== '-').length;

    if (nextScore > currentScore) {
      byEmail.set(normalizedEmail, row);
    }
  }

  return [...Array.from(byEmail.values()), ...passthrough];
}

export default function MothersPage() {
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [mothers, setMothers] = useState<MotherRow[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadMothers() {
      try {
        const mothersSnapshot = await getDocs(collection(firebaseDb, 'mothers'));
        const rows: MotherRow[] = mothersSnapshot.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const firstName = toLabel(data.firstName ?? data.first_name, '');
          const lastName = toLabel(data.lastName ?? data.last_name, '');
          const fullName = `${firstName} ${lastName}`.trim();

          return {
            id: docItem.id,
            name: fullName || toLabel(data.full_name ?? data.name, 'Unknown Mother'),
            email: toLabel(data.email ?? data.Email ?? data.userEmail, ''),
            phone: toLabel(data.phone),
            location: toLabel(data.location ?? data.county),
            status: toLabel(data.status ?? data.maternalStatus ?? data.stage, 'UNKNOWN'),
          };
        });

        if (isMounted) {
          setMothers(dedupeRows(rows));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMothers();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredMothers = useMemo(() => {
    const nameTerm = nameFilter.trim().toLowerCase();
    const phoneTerm = phoneFilter.trim().toLowerCase();
    const statusTerm = statusFilter.trim().toLowerCase();
    const locationTerm = locationFilter.trim().toLowerCase();

    if (!nameTerm && !phoneTerm && !statusTerm && !locationTerm) {
      return mothers;
    }

    return mothers.filter((m) => {
      const nameMatches = !nameTerm || m.name.toLowerCase().includes(nameTerm);
      const phoneMatches = !phoneTerm || m.phone.toLowerCase().includes(phoneTerm);
      const statusMatches = !statusTerm || m.status.toLowerCase().includes(statusTerm);
      const locationMatches = !locationTerm || m.location.toLowerCase().includes(locationTerm);
      return nameMatches && phoneMatches && statusMatches && locationMatches;
    });
  }, [
    mothers,
    nameFilter,
    phoneFilter,
    statusFilter,
    locationFilter,
  ]);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Mothers Registry</h1>
            <p className="page-subtitle">Manage patient directories, status updates, and emergency details.</p>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <span>Registered Maternal Profiles ({filteredMothers.length})</span>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Contact Info</th>
                  <th>Location</th>
                  <th>Maternal Status</th>
                  <th>Actions</th>
                </tr>
                <tr className="table-filter-row">
                  <th>
                    <input className="table-filter-input" placeholder="Search name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
                  </th>
                  <th>
                    <input className="table-filter-input" placeholder="Phone" value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value)} />
                  </th>
                  <th>
                    <input className="table-filter-input" placeholder="Location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
                  </th>
                  <th>
                    <input className="table-filter-input" placeholder="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Loading mothers from Firestore...</td>
                  </tr>
                ) : filteredMothers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No registered mothers found.</td>
                  </tr>
                ) : (
                  filteredMothers.map((mother) => (
                    <tr key={mother.id}>
                      <td className="table-cell-strong">{mother.name}</td>
                      <td>{mother.phone}</td>
                      <td>{mother.location}</td>
                      <td>
                        <span className={`badge ${mother.status.toUpperCase().includes('PREG') ? 'badge-success' : 'badge-warning'}`}>
                          {mother.status}
                        </span>
                      </td>
                      <td>
                        <Link href={`/mothers/${mother.id}`} className="btn btn-secondary btn-compact">
                          View Details
                        </Link>
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
