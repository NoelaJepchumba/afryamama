'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, firebaseDb } from '@/lib/firebaseClient';

interface MotherRow {
  id: string;
  name: string;
  phone: string;
  location: string;
  bloodGroup: string;
  status: string;
  edd: string;
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

export default function MothersPage() {
  const [search, setSearch] = useState('');
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
            phone: toLabel(data.phone),
            location: toLabel(data.location ?? data.county),
            bloodGroup: toLabel(data.bloodGroup ?? data.blood_group),
            status: toLabel(data.status ?? data.maternalStatus ?? data.stage, 'UNKNOWN'),
            edd: toLabel(data.edd ?? data.expectedDeliveryDate ?? data.expected_delivery_date),
          };
        });

        if (isMounted) {
          setMothers(rows);
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
    const term = search.toLowerCase();
    return mothers.filter((m) =>
      m.name.toLowerCase().includes(term) ||
      m.location.toLowerCase().includes(term) ||
      m.phone.toLowerCase().includes(term)
    );
  }, [mothers, search]);

  return (
    <main className="main-content">
        <div className="header-container">
          <div>
            <h1 className="page-title">Mothers Registry</h1>
            <p className="page-subtitle">Manage patient directories, status updates, and emergency details.</p>
          </div>
        </div>

        <div className="content-card" style={{ marginBottom: '24px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="search-mothers">Search Patients</label>
            <input 
              className="form-input"
              type="text" 
              id="search-mothers"
              placeholder="Search by name, phone number, location, etc..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                  <th>Blood Group</th>
                  <th>Maternal Status</th>
                  <th>Estimated Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>Loading mothers from Firestore...</td>
                  </tr>
                ) : filteredMothers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No registered mothers found.</td>
                  </tr>
                ) : (
                  filteredMothers.map((mother) => (
                    <tr key={mother.id}>
                      <td style={{ fontWeight: '600' }}>{mother.name}</td>
                      <td>{mother.phone}</td>
                      <td>{mother.location}</td>
                      <td>{mother.bloodGroup}</td>
                      <td>
                        <span className={`badge ${mother.status.toUpperCase().includes('PREG') ? 'badge-success' : 'badge-warning'}`}>
                          {mother.status}
                        </span>
                      </td>
                      <td>{mother.edd}</td>
                      <td>
                        <Link href={`/mothers/${mother.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
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
