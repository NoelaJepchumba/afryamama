'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';

interface UserRow {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  facility?: string;
  status?: string;
}

function normalizeValue(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function normalizeDoctorStatus(value: unknown): 'Active' | 'Inactive' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'active' || normalized === 'assigned') return 'Active';
  return 'Inactive';
}

function dedupeRows(rows: UserRow[]): UserRow[] {
  const byKey = new Map<string, UserRow>();

  rows.forEach((row) => {
    const normalizedEmail = normalizeValue(row.email);
    const key = normalizedEmail && normalizedEmail !== '-'
      ? `email:${normalizedEmail}`
      : `name:${normalizeValue(row.name)}|phone:${normalizeValue(row.phone)}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }

    const existingIsActive = normalizeValue(existing.status) === 'active';
    const currentIsActive = normalizeValue(row.status) === 'active';
    const existingInfoScore = Number(!!normalizeValue(existing.phone) && existing.phone !== '-') + Number(!!normalizeValue(existing.facility) && existing.facility !== '-');
    const currentInfoScore = Number(!!normalizeValue(row.phone) && row.phone !== '-') + Number(!!normalizeValue(row.facility) && row.facility !== '-');

    if ((currentIsActive && !existingIsActive) || (currentIsActive === existingIsActive && currentInfoScore > existingInfoScore)) {
      byKey.set(key, row);
    }
  });

  return Array.from(byKey.values());
}

export default function AdminUsersPage() {
  const [role, setRole] = useState<'mother' | 'doctor'>('mother');
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mothers, setMothers] = useState<UserRow[]>([]);
  const [doctors, setDoctors] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctorFirstName, setDoctorFirstName] = useState('');
  const [doctorLastName, setDoctorLastName] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
  const [doctorFacility, setDoctorFacility] = useState('');
  const [doctorMessage, setDoctorMessage] = useState<string | null>(null);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [deletingDoctorId, setDeletingDoctorId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        const [motherSnapshot, doctorSnapshot] = await Promise.all([
          getDocs(collection(firebaseDb, 'mothers')),
          getDocs(collection(firebaseDb, 'doctors')),
        ]);

        const motherRowsRaw: UserRow[] = motherSnapshot.docs.map((doc) => {
          const data = doc.data();
          const firstName = (data.firstName || data.first_name || '').toString().trim();
          const lastName = (data.lastName || data.last_name || '').toString().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          return {
            id: doc.id,
            name: fullName || data.full_name || data.name || 'Unknown Mother',
            email: data.email || '-',
            phone: data.phone || '-',
            facility: data.facility || '-',
            status: (data.status || 'Active').toString(),
          };
        });

        const doctorRowsRaw: UserRow[] = doctorSnapshot.docs.map((doc) => {
          const data = doc.data();
          const firstName = data.firstName || data.first_name || '';
          const lastName = data.lastName || data.last_name || '';
          const fullName = `${firstName} ${lastName}`.trim();
          return {
            id: doc.id,
            name: fullName || data.name || 'Unknown Doctor',
            email: data.email || '-',
            phone: data.phone || '-',
            facility: data.facility || '-',
            status: normalizeDoctorStatus(data.status),
          };
        });

        const motherRows = dedupeRows(motherRowsRaw);
        const doctorRows = dedupeRows(doctorRowsRaw);

        setMothers(motherRows);
        setDoctors(doctorRows);
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  const rows = useMemo(() => (role === 'mother' ? mothers : doctors), [doctors, mothers, role]);

  const filteredRows = useMemo(() => {
    const nameTerm = nameFilter.trim().toLowerCase();
    const emailTerm = emailFilter.trim().toLowerCase();
    const phoneTerm = phoneFilter.trim().toLowerCase();
    const facilityTerm = facilityFilter.trim().toLowerCase();
    const statusTerm = statusFilter.trim().toLowerCase();

    if (!nameTerm && !emailTerm && !phoneTerm && !facilityTerm && !statusTerm) return rows;

    return rows.filter((row) => {
      const nameMatches = !nameTerm || row.name.toLowerCase().includes(nameTerm);
      const emailMatches = !emailTerm || row.email.toLowerCase().includes(emailTerm);
      const phoneMatches = !phoneTerm || (row.phone || '').toLowerCase().includes(phoneTerm);
      const facilityMatches = !facilityTerm || (row.facility || '').toLowerCase().includes(facilityTerm);
      const normalizedRowStatus = normalizeDoctorStatus(row.status).toLowerCase();
      const statusMatches = !statusTerm || normalizedRowStatus === statusTerm;
      return nameMatches && emailMatches && phoneMatches && facilityMatches && statusMatches;
    });
  }, [rows, nameFilter, emailFilter, phoneFilter, facilityFilter, statusFilter]);

  async function addClinician() {
    if (!doctorFirstName.trim() || !doctorLastName.trim() || !doctorEmail.trim()) {
      setDoctorError('First name, last name, and email are required.');
      setDoctorMessage(null);
      return;
    }

    setSaving(true);
    setDoctorError(null);
    setDoctorMessage(null);

    try {
      const doctorRef = await addDoc(collection(firebaseDb, 'doctors'), {
        firstName: doctorFirstName.trim(),
        lastName: doctorLastName.trim(),
        email: doctorEmail.trim().toLowerCase(),
        phone: doctorPhone.trim(),
        facility: doctorFacility.trim(),
        role: 'DOCTOR',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        activationCodeSentAt: serverTimestamp(),
        status: 'Inactive',
      });

      let sentCode = false;
      try {
        const response = await fetch('/api/clinician-activation/send-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: doctorEmail.trim().toLowerCase() }),
        });
        await response.json();
        sentCode = response.ok;
      } catch {
        sentCode = false;
      }

      setDoctors((prev) => dedupeRows([
        {
          id: doctorRef.id,
          name: `${doctorFirstName.trim()} ${doctorLastName.trim()}`.trim(),
          email: doctorEmail.trim().toLowerCase(),
          phone: doctorPhone.trim() || '-',
          facility: doctorFacility.trim() || '-',
          status: 'Inactive',
        },
        ...prev,
      ]));

      setDoctorFirstName('');
      setDoctorLastName('');
      setDoctorEmail('');
      setDoctorPhone('');
      setDoctorFacility('');
      setDoctorMessage('Added clinician.');
      if (!sentCode) {
        console.warn('Clinician activation link email could not be sent.');
      }
    } catch {
      setDoctorError('Could not add clinician. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteClinician(row: UserRow) {
    if (!row.id) {
      setDoctorError('Could not delete clinician: missing document id.');
      return;
    }

    const confirmed = window.confirm(`Delete clinician ${row.name} (${row.email})? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingDoctorId(row.id);
    setDoctorError(null);
    setDoctorMessage(null);

    try {
      await deleteDoc(doc(firebaseDb, 'doctors', row.id));
      setDoctors((prev) => prev.filter((doctorRow) => doctorRow.id !== row.id));
      setDoctorMessage(`Clinician ${row.name} deleted successfully.`);
    } catch {
      setDoctorError('Could not delete clinician. Please try again.');
    } finally {
      setDeletingDoctorId(null);
    }
  }

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">User Management</h1>
        </div>
      </div>

      <div className="content-card">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <button
            className={`btn ${role === 'mother' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRole('mother')}
          >
            Mothers
          </button>
          <button
            className={`btn ${role === 'doctor' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRole('doctor')}
          >
            Doctors
          </button>
        </div>

        {role === 'doctor' ? (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '12px' }}>Add Clinician</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input
                className="form-input"
                placeholder="First name"
                value={doctorFirstName}
                onChange={(event) => setDoctorFirstName(event.target.value)}
              />
              <input
                className="form-input"
                placeholder="Last name"
                value={doctorLastName}
                onChange={(event) => setDoctorLastName(event.target.value)}
              />
              <input
                className="form-input"
                placeholder="Email"
                type="email"
                value={doctorEmail}
                onChange={(event) => setDoctorEmail(event.target.value)}
              />
              <input
                className="form-input"
                placeholder="Phone (optional)"
                value={doctorPhone}
                onChange={(event) => setDoctorPhone(event.target.value)}
              />
              <input
                className="form-input"
                placeholder="Facility (optional)"
                value={doctorFacility}
                onChange={(event) => setDoctorFacility(event.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="btn btn-primary" onClick={addClinician} disabled={saving}>
                {saving ? 'Adding...' : 'Add Clinician'}
              </button>
              {doctorMessage ? <span style={{ color: 'var(--success)' }}>{doctorMessage}</span> : null}
              {doctorError ? <span style={{ color: 'var(--danger)' }}>{doctorError}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Facility</th>
                <th>Status</th>
                {role === 'doctor' ? <th>Actions</th> : null}
              </tr>
              <tr className="table-filter-row">
                <th>
                  <input
                    id="users-filter-name"
                    className="table-filter-input"
                    value={nameFilter}
                    onChange={(event) => setNameFilter(event.target.value)}
                    placeholder="Search name"
                  />
                </th>
                <th>
                  <input
                    id="users-filter-email"
                    className="table-filter-input"
                    value={emailFilter}
                    onChange={(event) => setEmailFilter(event.target.value)}
                    placeholder="Search email"
                  />
                </th>
                <th>
                  <input
                    id="users-filter-phone"
                    className="table-filter-input"
                    value={phoneFilter}
                    onChange={(event) => setPhoneFilter(event.target.value)}
                    placeholder="Search phone"
                  />
                </th>
                <th>
                  <input
                    id="users-filter-facility"
                    className="table-filter-input"
                    value={facilityFilter}
                    onChange={(event) => setFacilityFilter(event.target.value)}
                    placeholder="Search facility"
                  />
                </th>
                <th>
                  {role === 'doctor' ? (
                    <select
                      id="users-filter-status"
                      className="table-filter-input"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value="">All statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  ) : (
                    <input
                      id="users-filter-status"
                      className="table-filter-input"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      placeholder="Search status"
                    />
                  )}
                </th>
                {role === 'doctor' ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={role === 'doctor' ? 6 : 5}>Loading users from Firestore...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={role === 'doctor' ? 6 : 5}>No users found for the selected filter.</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id || `${row.email}-${index}`}>
                    <td className="table-cell-strong">{row.name}</td>
                    <td>{row.email}</td>
                    <td>{row.phone || '-'}</td>
                    <td>{row.facility || '-'}</td>
                    <td>
                      {role === 'doctor' ? (
                        <span className={`badge ${normalizeDoctorStatus(row.status) === 'Active' ? 'badge-success' : 'badge-warning'}`}>
                          {normalizeDoctorStatus(row.status)}
                        </span>
                      ) : (
                        <span className={`badge ${String(row.status || '').toLowerCase() === 'active' ? 'badge-success' : 'badge-warning'}`}>
                          {row.status || 'Inactive'}
                        </span>
                      )}
                    </td>
                    {role === 'doctor' ? (
                      <td>
                        <button
                          className="btn btn-secondary btn-compact"
                          onClick={() => deleteClinician(row)}
                          disabled={deletingDoctorId === row.id}
                        >
                          {deletingDoctorId === row.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    ) : null}
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
