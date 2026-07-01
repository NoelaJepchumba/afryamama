'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useAuth } from '@/components/AuthProvider';
import { firebaseDb } from '@/lib/firebaseClient';

interface AdminProfileModel {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
}

const defaultProfile: AdminProfileModel = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  title: '',
};

export default function AdminProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<AdminProfileModel>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentPath, setDocumentPath] = useState<{ collectionName: string; docId: string } | null>(null);
  const [fallbackEmail, setFallbackEmail] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedFallbackEmail = window.localStorage.getItem('afyamama-fallback-email') || '';
    setFallbackEmail(storedFallbackEmail.trim().toLowerCase());
  }, []);

  const effectiveEmail = (user?.email || fallbackEmail || '').trim();
  const effectiveUid = (user?.uid || '').trim();

  useEffect(() => {
    async function loadProfile() {
      if (!effectiveEmail) {
        setLoading(false);
        return;
      }

      const canonicalCollection = 'Admins';
      const canonicalDocId = effectiveUid || effectiveEmail || 'admin-profile';
      const canonicalRef = doc(firebaseDb, canonicalCollection, canonicalDocId);
      const canonicalDoc = await getDoc(canonicalRef);

      function toNameParts(data: Record<string, unknown>): { firstName: string; lastName: string } {
        const directFirst = (data.firstName || data.first_name || '').toString().trim();
        const directLast = (data.lastName || data.last_name || '').toString().trim();
        if (directFirst || directLast) {
          return { firstName: directFirst, lastName: directLast };
        }

        const combined = (data.fullName || data.name || data.username || '').toString().trim();
        if (!combined) {
          return { firstName: '', lastName: '' };
        }

        const parts = combined.split(/\s+/).filter(Boolean);
        return {
          firstName: parts[0] || combined,
          lastName: parts.slice(1).join(' '),
        };
      }

      if (canonicalDoc.exists()) {
        const data = canonicalDoc.data();
        const nameParts = toNameParts(data as Record<string, unknown>);
        setProfile({
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email: data.email || data.Email || data.userEmail || data.user_email || effectiveEmail,
          phone: data.phone || '',
          title: data.title || data.role || data.Role || 'ADMIN',
        });
        setDocumentPath({ collectionName: canonicalCollection, docId: canonicalDocId });
        setLoading(false);
        return;
      }

      const collections = ['Admins'];
      let matchedData: Record<string, unknown> | null = null;
      let matchedPath: { collectionName: string; docId: string } | null = null;

      for (const name of collections) {
        const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
        for (const fieldName of emailFields) {
          const candidate = await getDocs(
            query(collection(firebaseDb, name), where(fieldName, '==', effectiveEmail), limit(1))
          );
          if (!candidate.empty) {
            matchedData = candidate.docs[0].data() as Record<string, unknown>;
            matchedPath = { collectionName: name, docId: candidate.docs[0].id };
            break;
          }
        }

        if (matchedData && matchedPath) {
          break;
        }
      }

      if (!matchedData && effectiveEmail) {
        const allDocs = await getDocs(collection(firebaseDb, canonicalCollection));
        const normalizedEmail = effectiveEmail.toLowerCase();
        const matchedByNormalizedEmail = allDocs.docs.find((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          const candidates = [data.email, data.Email, data.userEmail, data.user_email]
            .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
            .filter(Boolean);
          return candidates.includes(normalizedEmail);
        });

        if (matchedByNormalizedEmail) {
          matchedData = matchedByNormalizedEmail.data() as Record<string, unknown>;
          matchedPath = { collectionName: canonicalCollection, docId: matchedByNormalizedEmail.id };
        }
      }

      if (!matchedData || !matchedPath) {
        setProfile((prev) => ({ ...prev, email: effectiveEmail || prev.email, title: prev.title || 'ADMIN' }));
        setDocumentPath({ collectionName: canonicalCollection, docId: canonicalDocId });
        setLoading(false);
        return;
      }

      const nameParts = toNameParts(matchedData);

      setProfile({
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: matchedData.email || matchedData.Email || matchedData.userEmail || matchedData.user_email || effectiveEmail,
        phone: matchedData.phone || '',
        title: matchedData.title || matchedData.role || matchedData.Role || 'ADMIN',
      });
      setDocumentPath(matchedPath);
      setLoading(false);
    }

    loadProfile();
  }, [effectiveEmail, effectiveUid]);

  async function saveProfile() {
    if (!effectiveEmail) {
      setSaveError('You must be logged in to update profile.');
      setSaveMessage(null);
      return;
    }

    const targetCollection = documentPath?.collectionName || 'Admins';
    const targetDocId = documentPath?.docId || effectiveUid || effectiveEmail;
    const isNewDocument = !documentPath;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const payload: Record<string, unknown> = {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        email: effectiveEmail,
        phone: profile.phone.trim(),
        title: profile.title.trim(),
        role: 'ADMIN',
        updatedAt: serverTimestamp(),
      };

      if (effectiveUid) {
        payload.uid = effectiveUid;
      }

      if (isNewDocument) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(firebaseDb, targetCollection, targetDocId), payload, { merge: true });

      setSaveMessage('Profile updated successfully.');
    } catch {
      setSaveError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function onFieldChange(field: keyof AdminProfileModel, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
    if (saveMessage) setSaveMessage(null);
    if (saveError) setSaveError(null);
  }

  return (
    <main className="main-content">
      <div className="header-container">
        <div>
          <h1 className="page-title">Admin Profile</h1>
        </div>
      </div>

      <div className="content-card" style={{ maxWidth: '760px' }}>
        <div className="card-header">
          <span>Profile Details</span>
        </div>

        <div className="grid-two-cols">
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input
              className="form-input"
              value={loading ? 'Loading...' : profile.firstName}
              onChange={(event) => onFieldChange('firstName', event.target.value)}
              readOnly={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input
              className="form-input"
              value={loading ? 'Loading...' : profile.lastName}
              onChange={(event) => onFieldChange('lastName', event.target.value)}
              readOnly={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={loading ? 'Loading...' : profile.email} readOnly />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              className="form-input"
              value={loading ? 'Loading...' : profile.phone}
              onChange={(event) => onFieldChange('phone', event.target.value)}
              readOnly={loading}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Role</label>
            <input
              className="form-input"
              value={loading ? 'Loading...' : profile.title}
              onChange={(event) => onFieldChange('title', event.target.value)}
              readOnly={loading}
            />
          </div>
        </div>

        <div className="action-row">
          <button className="btn btn-primary" onClick={saveProfile} disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {saveMessage ? <span style={{ color: 'var(--success)' }}>{saveMessage}</span> : null}
          {saveError ? <span style={{ color: 'var(--danger)' }}>{saveError}</span> : null}
        </div>
      </div>
    </main>
  );
}
