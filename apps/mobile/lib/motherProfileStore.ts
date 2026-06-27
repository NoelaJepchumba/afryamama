import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseDb } from './firebaseClient';

export type MotherStage = 'PRENATAL' | 'POSTNATAL';
export type MultipleBirthType = 'SINGLE' | 'TWINS' | 'TRIPLETS';

export interface ChildProfile {
  childCode: string;
  fullName: string;
  sex: string;
  birthDate: string;
  birthWeightKg: string;
  multipleBirthType: MultipleBirthType;
  order: number;
}

export interface MotherProfile {
  email: string;
  motherCode: string;
  fullName: string;
  phone: string;
  stage: MotherStage;
  pregnancyWeek: string;
  babyAgeMonths: string;
  county: string;
  facility: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  assignedDoctorFacility?: string;
  children: ChildProfile[];
  createdAt: string;
}

export interface DoctorAssignment {
  doctorId: string;
  doctorName: string;
  facility: string;
  collectionName?: string;
}

const MEMORY_STORE = new Map<string, MotherProfile>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function readChildren(value: unknown): ChildProfile[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const order = Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1;
      const multipleBirthType = readText(item.multipleBirthType, order === 1 ? 'SINGLE' : 'TWINS').toUpperCase();

      return {
        childCode: normalizeCode(readText(item.childCode || item.code, '')),
        fullName: readText(item.fullName || item.name || item.childName, ''),
        sex: readText(item.sex || item.gender, ''),
        birthDate: readText(item.birthDate || item.dob || item.dateOfBirth, ''),
        birthWeightKg: readText(item.birthWeightKg || item.birthWeight || item.weightAtBirth, ''),
        multipleBirthType:
          multipleBirthType === 'TRIPLETS' ? 'TRIPLETS' : multipleBirthType === 'TWINS' ? 'TWINS' : 'SINGLE',
        order,
      } as ChildProfile;
    })
    .filter((item) => item.fullName || item.childCode);
}

function parseCodeNumber(code: string): number {
  const match = normalizeCode(code).match(/^(?:M|CH)(\d+)$/);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

function formatMotherCode(sequence: number): string {
  return `M${String(sequence).padStart(3, '0')}`;
}

function formatChildCode(motherCode: string, order: number): string {
  const normalizedMotherCode = normalizeCode(motherCode);
  return `${normalizedMotherCode}-B${order}`;
}

function normalizeFacilityName(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeFacilityKey(value: string): string {
  return normalizeFacilityName(value).replace(/[^A-Z0-9]/g, '');
}

function readDoctorName(data: Record<string, unknown>): string {
  const directName = readText(
    data.fullName || data.name || data.displayName || data.doctorName || data.doctor_name,
    ''
  );

  if (directName) return directName;

  const firstName = readText(data.firstName || data.first_name, '');
  const lastName = readText(data.lastName || data.last_name, '');
  const combined = `${firstName} ${lastName}`.trim();
  return combined;
}

function readDoctorFacility(data: Record<string, unknown>): string {
  return readText(data.facility || data.hospital || data.clinic || data.preferredFacility, 'Facility');
}

function readDoctorFacilityCandidates(data: Record<string, unknown>): string[] {
  const candidates: string[] = [];

  const pushIfText = (value: unknown) => {
    const text = readText(value, '');
    if (text) candidates.push(text);
  };

  pushIfText(data.facility);
  pushIfText(data.preferredFacility);
  pushIfText(data.hospital);
  pushIfText(data.clinic);
  pushIfText(data.facilityName);
  pushIfText(data.facility_name);
  pushIfText(data.hospitalName);
  pushIfText(data.hospital_name);
  pushIfText(data.workstation);
  pushIfText(data.station);

  if (Array.isArray(data.facilities)) {
    data.facilities.forEach((entry) => pushIfText(entry));
  }

  if (Array.isArray(data.clinics)) {
    data.clinics.forEach((entry) => pushIfText(entry));
  }

  return Array.from(new Set(candidates));
}

function isDoctorAvailable(data: Record<string, unknown>): boolean {
  const inactive = String(data.status || '').toUpperCase() === 'INACTIVE';
  const activeFalse = data.active === false;

  // Doctors can handle multiple mothers. Only block inactive/disabled profiles.
  return !(inactive || activeFalse);
}

async function getDoctorById(doctorId: string): Promise<DoctorAssignment | null> {
  const trimmedId = doctorId.trim();
  if (!trimmedId) return null;

  const collectionsToCheck = ['doctors', 'Doctors'];
  for (const collectionName of collectionsToCheck) {
    try {
      const doctorSnap = await getDoc(doc(firebaseDb, collectionName, trimmedId));
      if (!doctorSnap.exists()) continue;

      const data = doctorSnap.data() as Record<string, unknown>;
      const doctorName = readDoctorName(data);
      if (!doctorName) continue;

      return {
        doctorId: doctorSnap.id,
        doctorName,
        facility: readDoctorFacility(data),
        collectionName,
      };
    } catch {
      // Continue checking other doctor collection variants.
    }
  }

  return null;
}

export async function assignDoctorForFacility(
  facility: string,
  currentDoctorId?: string
): Promise<DoctorAssignment | null> {
  const normalizedFacility = normalizeFacilityName(facility);
  const normalizedFacilityKey = normalizeFacilityKey(facility);
  if (!normalizedFacility) return null;

  if (currentDoctorId?.trim()) {
    const currentDoctor = await getDoctorById(currentDoctorId);
    if (currentDoctor) {
      const doctorFacilityName = normalizeFacilityName(currentDoctor.facility || '');
      const doctorFacilityKey = normalizeFacilityKey(currentDoctor.facility || '');
      const sameFacility =
        doctorFacilityName === normalizedFacility ||
        doctorFacilityName.includes(normalizedFacility) ||
        normalizedFacility.includes(doctorFacilityName) ||
        doctorFacilityKey === normalizedFacilityKey;

      if (sameFacility) return currentDoctor;
    }
  }

  const collectionsToCheck = ['doctors', 'Doctors'];
  const candidates: DoctorAssignment[] = [];

  for (const collectionName of collectionsToCheck) {
    try {
      const exactQueries = [
        query(collection(firebaseDb, collectionName), where('facility', '==', facility.trim())),
        query(collection(firebaseDb, collectionName), where('preferredFacility', '==', facility.trim())),
        query(collection(firebaseDb, collectionName), where('hospital', '==', facility.trim())),
        query(collection(firebaseDb, collectionName), where('clinic', '==', facility.trim())),
      ];

      for (const condition of exactQueries) {
        try {
          const exactSnap = await getDocs(condition);
          exactSnap.docs.forEach((item) => {
            const data = item.data() as Record<string, unknown>;
            if (!isDoctorAvailable(data)) return;
            const doctorName = readDoctorName(data);
            if (!doctorName) return;

            candidates.push({
              doctorId: item.id,
              doctorName,
              facility: readDoctorFacility(data),
              collectionName,
            });
          });
        } catch {
          // Continue to broader scan.
        }
      }

      if (candidates.length > 0) {
        return candidates.sort((a, b) => a.doctorName.localeCompare(b.doctorName))[0];
      }

      const snapshot = await getDocs(collection(firebaseDb, collectionName));
      if (snapshot.empty) continue;

      snapshot.docs.forEach((item) => {
        const data = item.data() as Record<string, unknown>;
        if (!isDoctorAvailable(data)) return;

        const facilities = readDoctorFacilityCandidates(data);
        const hasMatch = facilities.some((doctorFacility) => {
          const doctorName = normalizeFacilityName(doctorFacility);
          const doctorKey = normalizeFacilityKey(doctorFacility);
          if (!doctorName || !doctorKey) return false;

          return (
            doctorName === normalizedFacility ||
            doctorName.includes(normalizedFacility) ||
            normalizedFacility.includes(doctorName) ||
            doctorKey === normalizedFacilityKey
          );
        });

        if (!hasMatch) return;

        const doctorName = readDoctorName(data);
        if (!doctorName) return;

        candidates.push({
          doctorId: item.id,
          doctorName,
          facility: facilities[0] || readDoctorFacility(data),
          collectionName,
        });
      });

      if (candidates.length > 0) {
        return candidates.sort((a, b) => a.doctorName.localeCompare(b.doctorName))[0];
      }
    } catch {
      // Continue checking fallback sources.
    }
  }

  return null;
}

export async function reserveDoctorForMother(
  assignment: DoctorAssignment,
  payload: { motherId?: string; motherEmail?: string; motherCode?: string }
): Promise<void> {
  const collectionName = assignment.collectionName || 'doctors';
  const updatePayload: Record<string, unknown> = {
    assignedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const motherId = readText(payload.motherId, '');
  const motherEmail = readText(payload.motherEmail, '').toLowerCase();
  const motherCode = readText(payload.motherCode, '');

  if (motherId) {
    updatePayload.assignedMotherIds = arrayUnion(motherId);
    // Keep single-value fields for backward compatibility with older readers.
    updatePayload.assignedMotherId = motherId;
  }

  if (motherEmail) {
    updatePayload.assignedMotherEmails = arrayUnion(motherEmail);
    updatePayload.assignedMotherEmail = motherEmail;
  }

  if (motherCode) {
    updatePayload.assignedMotherCodes = arrayUnion(motherCode);
    updatePayload.assignedMotherCode = motherCode;
  }

  await setDoc(
    doc(firebaseDb, collectionName, assignment.doctorId),
    updatePayload,
    { merge: true }
  );
}

async function getNextMotherSequence(): Promise<number> {
  try {
    const snapshots = await Promise.all([
      getDocs(collection(firebaseDb, 'mothers')),
      getDocs(collection(firebaseDb, 'Mothers')),
    ]);

    const allDocs = snapshots.flatMap((snapshot) => snapshot.docs);
    const maxSequence = allDocs.reduce((maxValue, docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const code = readText(data.motherCode || data.code || data.mother_code, '');
      const parsed = parseCodeNumber(code);
      return parsed > maxValue ? parsed : maxValue;
    }, 0);

    return maxSequence + 1;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

async function generateMotherCode(): Promise<string> {
  const nextSequence = await getNextMotherSequence();
  return formatMotherCode(nextSequence);
}

async function findMotherDocByEmail(email: string): Promise<QueryDocumentSnapshot | null> {
  const collectionNames = ['mothers', 'Mothers'];
  const emailFields = ['email', 'Email', 'userEmail', 'user_email', 'motherEmail', 'mother_email'];

  for (const name of collectionNames) {
    for (const field of emailFields) {
      try {
        const snapshot = await getDocs(query(collection(firebaseDb, name), where(field, '==', email), limit(1)));
        if (!snapshot.empty) {
          return snapshot.docs[0];
        }
      } catch {
        // Continue checking alternative field names/collections.
      }
    }
  }

  return null;
}

async function findMotherDocsForUpsert(email: string, motherCode: string): Promise<QueryDocumentSnapshot[]> {
  const matches = new Map<string, QueryDocumentSnapshot>();
  const emailFields = ['email', 'Email', 'userEmail', 'user_email', 'motherEmail', 'mother_email'];
  const codeFields = ['motherCode', 'mother_code', 'code'];

  for (const field of emailFields) {
    try {
      const snapshot = await getDocs(query(collection(firebaseDb, 'mothers'), where(field, '==', email), limit(20)));
      snapshot.docs.forEach((item) => matches.set(item.id, item));
    } catch {
      // Continue checking alternative field names.
    }
  }

  if (motherCode) {
    for (const field of codeFields) {
      try {
        const snapshot = await getDocs(query(collection(firebaseDb, 'mothers'), where(field, '==', motherCode), limit(20)));
        snapshot.docs.forEach((item) => matches.set(item.id, item));
      } catch {
        // Continue checking alternative field names.
      }
    }
  }

  return Array.from(matches.values());
}

export async function getMotherProfileByEmail(email: string): Promise<MotherProfile | null> {
  const key = normalizeEmail(email);

  if (MEMORY_STORE.has(key)) {
    return MEMORY_STORE.get(key) || null;
  }

  try {
    const docSnapshot = await findMotherDocByEmail(key);
    if (!docSnapshot) return null;

    const data = docSnapshot.data() as Record<string, unknown>;
    const profile: MotherProfile = {
      email: readText(data.email || data.Email || data.userEmail || data.user_email, key).toLowerCase(),
      motherCode: normalizeCode(readText(data.motherCode || data.code || data.mother_code, '')),
      fullName: readText(data.fullName || data.full_name || data.name, 'Mother'),
      phone: readText(data.phone || data.phoneNumber, ''),
      stage: readText(data.stage || data.motherStage, 'PRENATAL').toUpperCase() === 'POSTNATAL' ? 'POSTNATAL' : 'PRENATAL',
      pregnancyWeek: readText(data.pregnancyWeek || data.week || data.currentWeek, ''),
      babyAgeMonths: readText(data.babyAgeMonths || data.baby_months || data.infantAgeMonths, ''),
      county: readText(data.county, ''),
      facility: readText(data.facility || data.preferredFacility, ''),
      emergencyContactName: readText(data.emergencyContactName || data.emergency_name, ''),
      emergencyContactPhone: readText(data.emergencyContactPhone || data.emergency_phone, ''),
      assignedDoctorId: readText(data.assignedDoctorId || data.doctorId, ''),
      assignedDoctorName: readText(data.assignedDoctorName || data.doctorName || data.assignedDoctor, ''),
      assignedDoctorFacility: readText(data.assignedDoctorFacility || data.doctorFacility, ''),
      children: readChildren(data.children || data.childProfiles),
      createdAt: readText(data.createdAt, ''),
    };

    MEMORY_STORE.set(key, profile);
    return profile;
  } catch {
    return null;
  }
}

export async function getMotherProfileByCode(motherCode: string): Promise<MotherProfile | null> {
  const code = normalizeCode(motherCode);
  if (!code) return null;

  const collectionNames = ['mothers', 'Mothers'];
  const codeFields = ['motherCode', 'mother_code', 'code'];

  for (const name of collectionNames) {
    for (const field of codeFields) {
      try {
        const snapshot = await getDocs(query(collection(firebaseDb, name), where(field, '==', code), limit(1)));
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as Record<string, unknown>;
          return {
            email: readText(data.email || data.Email || data.userEmail || data.user_email, '').toLowerCase(),
            motherCode: code,
            fullName: readText(data.fullName || data.full_name || data.name, 'Mother'),
            phone: readText(data.phone || data.phoneNumber, ''),
            stage: readText(data.stage || data.motherStage, 'PRENATAL').toUpperCase() === 'POSTNATAL' ? 'POSTNATAL' : 'PRENATAL',
            pregnancyWeek: readText(data.pregnancyWeek || data.week || data.currentWeek, ''),
            babyAgeMonths: readText(data.babyAgeMonths || data.baby_months || data.infantAgeMonths, ''),
            county: readText(data.county, ''),
            facility: readText(data.facility || data.preferredFacility, ''),
            emergencyContactName: readText(data.emergencyContactName || data.emergency_name, ''),
            emergencyContactPhone: readText(data.emergencyContactPhone || data.emergency_phone, ''),
            assignedDoctorId: readText(data.assignedDoctorId || data.doctorId, ''),
            assignedDoctorName: readText(data.assignedDoctorName || data.doctorName || data.assignedDoctor, ''),
            assignedDoctorFacility: readText(data.assignedDoctorFacility || data.doctorFacility, ''),
            children: readChildren(data.children || data.childProfiles),
            createdAt: readText(data.createdAt, ''),
          };
        }
      } catch {
        // Continue checking alternatives.
      }
    }
  }

  return null;
}

export async function saveMotherProfile(profile: MotherProfile): Promise<MotherProfile> {
  const key = normalizeEmail(profile.email);
  const motherCode = normalizeCode(profile.motherCode) || (await generateMotherCode());
  const existingProfile = await getMotherProfileByEmail(key);
  const persistedDoctorId = readText(existingProfile?.assignedDoctorId, '');
  const persistedDoctorName = readText(existingProfile?.assignedDoctorName, '');
  const persistedDoctorFacility = readText(existingProfile?.assignedDoctorFacility, '');
  const incomingDoctorId = readText(profile.assignedDoctorId, '');

  let assignedDoctor =
    persistedDoctorId || incomingDoctorId
      ? await getDoctorById(persistedDoctorId || incomingDoctorId)
      : null;

  if (!assignedDoctor) {
    assignedDoctor = await assignDoctorForFacility(profile.facility || '', profile.assignedDoctorId || '');
  }

  const authUid = getAuth().currentUser?.uid || '';
  const normalizedChildren = (profile.children || [])
    .map((child, index) => {
      const order = Number.isFinite(Number(child.order)) ? Number(child.order) : index + 1;
      const computedCode = formatChildCode(motherCode, order);
      return {
        childCode: normalizeCode(child.childCode) || computedCode,
        fullName: child.fullName.trim(),
        sex: child.sex.trim(),
        birthDate: child.birthDate.trim(),
        birthWeightKg: child.birthWeightKg.trim(),
        multipleBirthType: child.multipleBirthType,
        order,
      } as ChildProfile;
    })
    .filter((child) => child.fullName);

  const payload = {
    ...profile,
    email: key,
    motherCode,
    assignedDoctorId: assignedDoctor?.doctorId || persistedDoctorId || incomingDoctorId || '',
    assignedDoctorName: assignedDoctor?.doctorName || persistedDoctorName || readText(profile.assignedDoctorName, ''),
    assignedDoctorFacility: assignedDoctor?.facility || persistedDoctorFacility || readText(profile.assignedDoctorFacility, ''),
    children: normalizedChildren,
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const docId = key.replace(/[^a-z0-9]/gi, '_');
    const matchedDocs = await findMotherDocsForUpsert(key, motherCode);
    const matchedIds = matchedDocs.map((item) => item.id);

    const canonicalMotherDocId =
      (authUid && matchedIds.includes(authUid) ? authUid : '') ||
      (matchedIds.includes(docId) ? docId : '') ||
      matchedIds[0] ||
      authUid ||
      docId;

    await setDoc(doc(firebaseDb, 'mothers', canonicalMotherDocId), payload, { merge: true });

    const duplicateIds = matchedIds.filter((id) => id !== canonicalMotherDocId);
    if (duplicateIds.length > 0) {
      await Promise.all(duplicateIds.map((id) => deleteDoc(doc(firebaseDb, 'mothers', id))));
    }

    await Promise.all(
      normalizedChildren.map((child) => {
        const childDocId = child.childCode.toLowerCase().replace(/[^a-z0-9]/gi, '_');
        return setDoc(
          doc(firebaseDb, 'children', childDocId),
          {
            ...child,
            motherCode,
            motherEmail: key,
            motherName: profile.fullName,
            familyLinkId: `${motherCode}-${child.childCode}`,
            assignedDoctorId: assignedDoctor?.doctorId || '',
            assignedDoctorName: assignedDoctor?.doctorName || '',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      })
    );

    if (assignedDoctor) {
      await reserveDoctorForMother(assignedDoctor, {
        motherId: canonicalMotherDocId,
        motherEmail: key,
        motherCode,
      });
    }

    const previousDoctorId = persistedDoctorId;
    const nextDoctorId = readText(payload.assignedDoctorId, '');
    if (previousDoctorId && nextDoctorId && previousDoctorId !== nextDoctorId) {
      await addDoc(collection(firebaseDb, 'notifications'), {
        title: 'Doctor assignment updated',
        message: `Your primary doctor is now ${readText(payload.assignedDoctorName, 'your new doctor')}.`,
        audience: 'MOTHER',
        email: key,
        motherEmail: key,
        type: 'DOCTOR_CHANGE',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to save profile in database: ${error.message}`
        : 'Failed to save profile in database.'
    );
  }

  MEMORY_STORE.set(key, payload);
  return payload;
}

export async function deleteMotherAccountByEmail(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;

  const motherCode = MEMORY_STORE.get(key)?.motherCode || (await getMotherProfileByEmail(key))?.motherCode || '';

  const motherDocId = key.replace(/[^a-z0-9]/gi, '_');
  const docsToDelete = new Set<string>();
  docsToDelete.add(motherDocId);

  const collectionNames = ['mothers', 'Mothers'];
  const emailFields = ['email', 'Email', 'userEmail', 'user_email', 'motherEmail', 'mother_email'];

  try {
    for (const collectionName of collectionNames) {
      for (const emailField of emailFields) {
        const snapshot = await getDocs(
          query(collection(firebaseDb, collectionName), where(emailField, '==', key), limit(20))
        );
        snapshot.docs.forEach((item) => docsToDelete.add(item.id));
      }
    }

    await Promise.all(
      Array.from(docsToDelete).map((id) => deleteDoc(doc(firebaseDb, 'mothers', id)))
    );

    const childDocsToDelete = new Set<string>();
    const childEmailFields = ['motherEmail', 'mother_email', 'email'];

    for (const childEmailField of childEmailFields) {
      const childByEmail = await getDocs(
        query(collection(firebaseDb, 'children'), where(childEmailField, '==', key), limit(50))
      );
      childByEmail.docs.forEach((item) => childDocsToDelete.add(item.id));
    }

    if (motherCode) {
      const childCodeFields = ['motherCode', 'mother_code'];
      for (const childCodeField of childCodeFields) {
        const childByCode = await getDocs(
          query(collection(firebaseDb, 'children'), where(childCodeField, '==', motherCode), limit(50))
        );
        childByCode.docs.forEach((item) => childDocsToDelete.add(item.id));
      }
    }

    await Promise.all(
      Array.from(childDocsToDelete).map((id) => deleteDoc(doc(firebaseDb, 'children', id)))
    );

    MEMORY_STORE.delete(key);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to delete account in database: ${error.message}`
        : 'Failed to delete account in database.'
    );
  }
}
