import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { firebaseDb } from './firebaseClient';

export interface MobileAppointment {
  id: string;
  date: string;
  time: string;
  doctor: string;
  reason: string;
  status: string;
}

export interface MobileRecord {
  id: string;
  date: string;
  weight: string;
  bp: string;
  hr: string;
  notes: string;
}

export interface MobileVaccine {
  id: string;
  name: string;
  scheduled: string;
  administered: string | null;
  status: 'COMPLETED' | 'PENDING';
}

export interface MobileChildProfile {
  childName: string;
  childBirth: string;
}

export interface MobileTip {
  id: string;
  title: string;
  category: string;
  content: string;
}

export interface MobileMotherProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  motherCode: string;
}

export interface MobileMilestone {
  id: string;
  title: string;
  week: string;
  status: string;
  details: string;
}

export interface MobileNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  type: string;
  read: boolean;
}

export interface MobileGrowthPoint {
  id: string;
  date: string;
  weight: string;
  height: string;
  headCircumference: string;
}

function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

function readDate(value: unknown, fallback = 'Not set'): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString();
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
    try {
      return (value as { toDate: () => Date }).toDate().toLocaleDateString();
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

async function findByEmail(
  collectionNames: string[],
  email: string,
  fields: string[] = ['email', 'Email', 'userEmail', 'user_email']
): Promise<QueryDocumentSnapshot | null> {
  for (const collectionName of collectionNames) {
    for (const field of fields) {
      const snapshot = await getDocs(
        query(collection(firebaseDb, collectionName), where(field, '==', email), limit(1))
      );
      if (!snapshot.empty) return snapshot.docs[0];
    }
  }
  return null;
}

export async function fetchAppointments(email: string): Promise<MobileAppointment[]> {
  const collectionNames = ['appointments', 'Appointments'];
  const emailFields = ['motherEmail', 'email', 'userEmail', 'patientEmail'];

  for (const name of collectionNames) {
    for (const field of emailFields) {
      const snapshot = await getDocs(query(collection(firebaseDb, name), where(field, '==', email)));
      if (snapshot.empty) continue;

      return snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          date: readDate(data.date || data.appointmentDate || data.scheduledAt),
          time: readText(data.time || data.appointmentTime || data.slot, 'Time not set'),
          doctor: readText(data.doctorName || data.provider || data.doctor, 'Clinician not assigned'),
          reason: readText(data.reason || data.purpose || data.type, 'General consultation'),
          status: readText(data.status, 'PENDING').toUpperCase(),
        };
      });
    }
  }

  return [];
}

export async function fetchRecords(email: string): Promise<MobileRecord[]> {
  const collectionNames = ['anc_records', 'ancRecords', 'records'];
  const emailFields = ['motherEmail', 'email', 'userEmail', 'patientEmail'];

  for (const name of collectionNames) {
    for (const field of emailFields) {
      const snapshot = await getDocs(query(collection(firebaseDb, name), where(field, '==', email)));
      if (snapshot.empty) continue;

      return snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          date: readDate(data.date || data.visitDate || data.createdAt),
          weight: readText(data.weight || data.weightKg || data.motherWeight, 'Not recorded'),
          bp: readText(data.bp || data.bloodPressure || data.blood_pressure, 'Not recorded'),
          hr: readText(data.hr || data.fetalHeartRate || data.heartRate, 'Not recorded'),
          notes: readText(data.notes || data.observations || data.remarks, 'No clinical notes yet.'),
        };
      });
    }
  }

  return [];
}

export async function fetchImmunizationData(
  email: string
): Promise<{ child: MobileChildProfile | null; vaccines: MobileVaccine[] }> {
  const motherDoc = await findByEmail(['mothers', 'Mothers'], email);
  const motherId = motherDoc?.id || null;

  let child: MobileChildProfile | null = null;
  let childId: string | null = null;

  const childCollections = ['children', 'Children'];
  for (const name of childCollections) {
    const conditions = motherId
      ? [
          query(collection(firebaseDb, name), where('motherId', '==', motherId), limit(1)),
          query(collection(firebaseDb, name), where('mother_id', '==', motherId), limit(1)),
        ]
      : [];

    for (const condition of conditions) {
      const snap = await getDocs(condition);
      if (snap.empty) continue;

      const item = snap.docs[0];
      const data = item.data();
      childId = item.id;
      child = {
        childName: readText(data.name || data.childName || data.full_name, 'Child profile'),
        childBirth: readDate(data.dob || data.dateOfBirth || data.birthDate, 'Birth date not set'),
      };
      break;
    }

    if (child) break;
  }

  if (!childId) {
    return { child, vaccines: [] };
  }

  const vaccineCollections = ['immunizations', 'vaccinations', 'vaccine_records'];
  const vaccines: MobileVaccine[] = [];

  for (const name of vaccineCollections) {
    const snap = await getDocs(query(collection(firebaseDb, name), where('childId', '==', childId)));
    if (snap.empty) continue;

    for (const item of snap.docs) {
      const data = item.data();
      const status = readText(data.status, 'PENDING').toUpperCase() === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
      vaccines.push({
        id: item.id,
        name: readText(data.name || data.vaccineName || data.title, 'Vaccine'),
        scheduled: readDate(data.scheduledDate || data.scheduled_for || data.schedule, 'Schedule not set'),
        administered: readDate(data.administeredDate || data.givenOn || data.completedAt, '' ) || null,
        status,
      });
    }

    if (vaccines.length > 0) break;
  }

  return { child, vaccines };
}

export async function fetchWellnessTips(email: string): Promise<MobileTip[]> {
  const collectionNames = ['wellness_tips', 'wellnessTips', 'notifications'];
  const tips: MobileTip[] = [];

  for (const name of collectionNames) {
    const snapshot = await getDocs(collection(firebaseDb, name));
    if (snapshot.empty) continue;

    for (const item of snapshot.docs) {
      const data = item.data();
      const audience = readText(data.audience || data.role || data.target || 'MOTHER').toUpperCase();
      const emailMatch = readText(data.email || data.userEmail || '').toLowerCase();
      const isForAll = audience === 'ALL' || audience === 'MOTHER' || !audience;
      const isForCurrentUser = emailMatch ? emailMatch === email : true;

      if (!isForAll || !isForCurrentUser) continue;

      tips.push({
        id: item.id,
        title: readText(data.title, 'Wellness Tip'),
        category: readText(data.category || data.type || 'WELLNESS').toUpperCase(),
        content: readText(data.message || data.content || data.body, 'No details provided.'),
      });
    }

    if (tips.length > 0) break;
  }

  return tips;
}

export async function fetchMotherProfile(email: string): Promise<MobileMotherProfile | null> {
  const doc = await findByEmail(['mothers', 'Mothers'], email);
  if (!doc) return null;

  const data = doc.data();
  const firstName = readText(data.firstName || data.first_name);
  const lastName = readText(data.lastName || data.last_name);
  const combinedName = `${firstName} ${lastName}`.trim();
  const fullName = readText(data.fullName || data.full_name || data.name, combinedName || 'Mother');

  return {
    id: doc.id,
    fullName,
    email: readText(data.email || data.Email, email),
    phone: readText(data.phone || data.phoneNumber || data.tel, 'Not provided'),
    motherCode: readText(data.motherCode || data.mother_code || data.code, 'Not set'),
  };
}

export async function fetchMilestones(email: string): Promise<MobileMilestone[]> {
  const collectionNames = ['milestones', 'pregnancy_milestones', 'motherMilestones'];
  const emailFields = ['motherEmail', 'email', 'userEmail', 'patientEmail'];

  for (const name of collectionNames) {
    for (const field of emailFields) {
      const snapshot = await getDocs(query(collection(firebaseDb, name), where(field, '==', email)));
      if (snapshot.empty) continue;

      return snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          title: readText(data.title || data.name || data.milestone, 'Milestone'),
          week: readText(data.week || data.pregnancyWeek || data.trimester, 'Not set'),
          status: readText(data.status || data.progress, 'PENDING').toUpperCase(),
          details: readText(data.details || data.description || data.notes, 'No details provided.'),
        };
      });
    }
  }

  return [];
}

export async function fetchNotifications(email: string): Promise<MobileNotification[]> {
  const collectionNames = ['notifications', 'Notifications', 'alerts'];
  const notifications: MobileNotification[] = [];

  for (const name of collectionNames) {
    const snapshot = await getDocs(collection(firebaseDb, name));
    if (snapshot.empty) continue;

    for (const item of snapshot.docs) {
      const data = item.data();
      const audience = readText(data.audience || data.role || data.target || 'MOTHER').toUpperCase();
      const emailMatch = readText(data.email || data.userEmail || data.motherEmail).toLowerCase();
      const isForMother = audience === 'MOTHER' || audience === 'ALL' || !audience;
      const belongsToMother = emailMatch ? emailMatch === email : true;
      if (!isForMother || !belongsToMother) continue;

      notifications.push({
        id: item.id,
        title: readText(data.title || data.subject, 'Notification'),
        message: readText(data.message || data.body || data.content, 'No details provided.'),
        date: readDate(data.date || data.createdAt || data.timestamp),
        type: readText(data.type || data.category, 'GENERAL').toUpperCase(),
        read: readBoolean(data.read || data.isRead, false),
      });
    }

    if (notifications.length > 0) break;
  }

  return notifications;
}

export async function fetchGrowthMonitoring(email: string): Promise<MobileGrowthPoint[]> {
  const motherDoc = await findByEmail(['mothers', 'Mothers'], email);
  const motherId = motherDoc?.id || null;

  const collectionNames = ['growth_monitoring', 'growthMonitoring', 'child_growth'];

  for (const name of collectionNames) {
    const queries = [
      query(collection(firebaseDb, name), where('email', '==', email)),
      query(collection(firebaseDb, name), where('motherEmail', '==', email)),
      ...(motherId
        ? [
            query(collection(firebaseDb, name), where('motherId', '==', motherId)),
            query(collection(firebaseDb, name), where('mother_id', '==', motherId)),
          ]
        : []),
    ];

    for (const condition of queries) {
      const snapshot = await getDocs(condition);
      if (snapshot.empty) continue;

      return snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          date: readDate(data.date || data.recordedAt || data.createdAt),
          weight: readText(data.weight || data.weightKg || data.childWeight, 'Not recorded'),
          height: readText(data.height || data.length || data.childHeight, 'Not recorded'),
          headCircumference: readText(data.headCircumference || data.hc || data.head_size, 'Not recorded'),
        };
      });
    }
  }

  return [];
}
