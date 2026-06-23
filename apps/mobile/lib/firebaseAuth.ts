import {
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { firebaseAuth, firebaseDb } from './firebaseClient';

export interface MotherProfile {
  displayName: string;
  pregnancyWeek: number | null;
  nextAppointmentText: string | null;
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function nameFromEmail(email: string): string {
  const prefix = email.split('@')[0] || 'Mother';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readDateText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;

  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toLocaleDateString();
    } catch {
      return null;
    }
  }

  return null;
}

function getMotherEmail(data: Record<string, unknown>): string {
  return normalizeEmail(data.email ?? data.Email ?? data.userEmail ?? data.user_email);
}

async function loadMotherDocByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
  const collections = ['mothers', 'Mothers'];
  const candidateEmails = [email.trim(), normalizedEmail].filter(Boolean);

  for (const collectionName of collections) {
    for (const fieldName of emailFields) {
      for (const candidateEmail of candidateEmails) {
        const snapshot = await getDocs(
          query(collection(firebaseDb, collectionName), where(fieldName, '==', candidateEmail), limit(1))
        );

        if (!snapshot.empty) {
          return snapshot.docs[0].data() as Record<string, unknown>;
        }
      }
    }

    const fullSnapshot = await getDocs(collection(firebaseDb, collectionName));
    const matchedDoc = fullSnapshot.docs.find((item) => {
      const data = item.data() as Record<string, unknown>;
      return getMotherEmail(data) === normalizedEmail;
    });

    if (matchedDoc) {
      return matchedDoc.data() as Record<string, unknown>;
    }
  }

  return null;
}

async function loadMotherDocSnapshotByEmail(email: string): Promise<QueryDocumentSnapshot | null> {
  const normalizedEmail = normalizeEmail(email);
  const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
  const collections = ['mothers', 'Mothers'];
  const candidateEmails = [email.trim(), normalizedEmail].filter(Boolean);

  for (const collectionName of collections) {
    for (const fieldName of emailFields) {
      for (const candidateEmail of candidateEmails) {
        const snapshot = await getDocs(
          query(collection(firebaseDb, collectionName), where(fieldName, '==', candidateEmail), limit(1))
        );

        if (!snapshot.empty) {
          return snapshot.docs[0];
        }
      }
    }

    const fullSnapshot = await getDocs(collection(firebaseDb, collectionName));
    const matchedDoc = fullSnapshot.docs.find((item) => {
      const data = item.data() as Record<string, unknown>;
      return getMotherEmail(data) === normalizedEmail;
    });

    if (matchedDoc) {
      return matchedDoc;
    }
  }

  return null;
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function loginWithMotherCollection(email: string, password: string): Promise<MotherProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const docSnapshot = await loadMotherDocSnapshotByEmail(normalizedEmail);
  if (!docSnapshot) return null;

  const data = docSnapshot.data() as Record<string, unknown>;
  const storedPassword = normalizePassword(data.password ?? data.Password ?? data.pass);
  if (!storedPassword || storedPassword !== password) {
    return null;
  }

  const firstName = (data.firstName || data.first_name || '').toString();
  const lastName = (data.lastName || data.last_name || '').toString();
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    displayName: fullName || (data.fullName || data.full_name || data.name || nameFromEmail(normalizedEmail)).toString(),
    pregnancyWeek: readNumber(data.pregnancyWeek ?? data.week ?? data.currentWeek),
    nextAppointmentText: readDateText(data.nextAppointment ?? data.next_appointment ?? data.appointmentDate),
  };
}

export async function loginWithFirebase(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export async function logoutFromFirebase() {
  return signOut(firebaseAuth);
}

export async function loadMotherProfile(user: User): Promise<MotherProfile> {
  const email = user.email?.trim().toLowerCase() || '';

  if (!email) {
    return {
      displayName: 'Mother',
      pregnancyWeek: null,
      nextAppointmentText: null,
    };
  }

  const data = await loadMotherDocByEmail(email);

  if (!data) {
    return {
      displayName: nameFromEmail(email),
      pregnancyWeek: null,
      nextAppointmentText: null,
    };
  }

  const firstName = (data.firstName || data.first_name || '').toString();
  const lastName = (data.lastName || data.last_name || '').toString();
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    displayName: fullName || (data.fullName || data.full_name || data.name || nameFromEmail(email)).toString(),
    pregnancyWeek: readNumber(data.pregnancyWeek ?? data.week ?? data.currentWeek),
    nextAppointmentText: readDateText(data.nextAppointment ?? data.next_appointment ?? data.appointmentDate),
  };
}
