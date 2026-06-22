import {
  collection,
  doc,
  getDoc,
  getDocs,
  GoogleAuthProvider,
  limit,
  query,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  where,
  firebaseAuth,
  firebaseDb,
} from '@/lib/firebaseClient';

export type DashboardRole = 'DOCTOR' | 'ADMIN';

type FirebaseUser = {
  uid: string;
  email: string | null;
};

type FirestoreDocSnapshot = {
  id: string;
  data(): Record<string, unknown>;
};

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeRole(value: unknown): DashboardRole | null {
  if (typeof value !== 'string') return null;
  const role = value.trim().toUpperCase();
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'DOCTOR') return 'DOCTOR';
  return null;
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function matchesUserDoc(
  docSnapshot: FirestoreDocSnapshot,
  email: string,
  uid: string
): boolean {
  const data = docSnapshot.data() as Record<string, unknown>;

  const candidateEmails = [
    data.email,
    data.Email,
    data.userEmail,
    data.user_email,
  ].map(normalizeEmail);

  if (candidateEmails.includes(email)) return true;

  const candidateUids = [
    data.uid,
    data.userId,
    data.user_id,
    data.firebaseUid,
    data.firebase_uid,
  ].map((value) => (typeof value === 'string' ? value : ''));

  return candidateUids.includes(uid);
}

async function findMatchingDoc(
  collectionNames: string[],
  email: string,
  uid: string
): Promise<FirestoreDocSnapshot | null> {
  for (const collectionName of collectionNames) {
    const emailFields = ['email', 'Email', 'userEmail', 'user_email'];

    for (const fieldName of emailFields) {
      const emailQuery = query(collection(firebaseDb, collectionName), where(fieldName, '==', email), limit(1));
      const emailSnapshot = await getDocs(emailQuery);
      if (!emailSnapshot.empty) {
        return emailSnapshot.docs[0];
      }
    }

    const fullSnapshot = await getDocs(collection(firebaseDb, collectionName));
    const matchingDoc = fullSnapshot.docs.find((docSnapshot: FirestoreDocSnapshot) =>
      matchesUserDoc(docSnapshot, email, uid)
    );
    if (matchingDoc) {
      return matchingDoc;
    }
  }

  return null;
}

async function findRoleInUsers(email: string, uid: string): Promise<DashboardRole | null> {
  const usersDoc = await findMatchingDoc(['users', 'Users'], email, uid);
  if (!usersDoc) return null;

  const data = usersDoc.data() as Record<string, unknown>;
  return normalizeRole(data.role ?? data.Role);
}

async function existsInCollection(collectionName: string, email: string, uid: string): Promise<boolean> {
  const namingVariants = [collectionName, collectionName.charAt(0).toUpperCase() + collectionName.slice(1)];
  const docMatch = await findMatchingDoc(namingVariants, email, uid);
  return !!docMatch;
}

export async function resolveDashboardRole(user: FirebaseUser): Promise<DashboardRole | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const uid = user.uid;

  const roleFromUsers = await findRoleInUsers(email, uid);
  if (roleFromUsers) return roleFromUsers;

  if (await existsInCollection('admins', email, uid)) return 'ADMIN';
  if (await existsInCollection('doctors', email, uid)) return 'DOCTOR';

  if (email.includes('admin')) return 'ADMIN';
  if (email.includes('doctor')) return 'DOCTOR';

  return null;
}

export async function loginWithFirebase(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function loginDoctorWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(firebaseAuth, provider);
}

export async function loginAdminFromFirestoreDoc(email: string, password: string): Promise<boolean> {
  const collections = ['Admins', 'admins'];
  const ids = ['admin1', 'Admin1'];

  for (const collectionName of collections) {
    for (const id of ids) {
      const snapshot = await getDoc(doc(firebaseDb, collectionName, id));
      if (!snapshot.exists()) continue;

      const data = snapshot.data() as Record<string, unknown>;
      const docEmail = normalizeEmail(data.email ?? data.Email ?? data.userEmail ?? data.user_email);
      const docPassword = normalizePassword(data.password ?? data.Password ?? data.pass);

      if (docEmail === normalizeEmail(email) && docPassword === password) {
        return true;
      }
    }
  }

  return false;
}

export async function logoutFromFirebase() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('afyamama-fallback-role');
    window.localStorage.removeItem('afyamama-fallback-email');
  }
  return signOut(firebaseAuth);
}
