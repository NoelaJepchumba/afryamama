declare module 'firebase/app' {
  export function initializeApp(options: Record<string, unknown>): unknown;
  export function getApps(): unknown[];
}

declare module 'firebase/auth' {
  export interface User {
    uid: string;
    email: string | null;
  }

  export interface UserCredential {
    user: User;
  }

  export class GoogleAuthProvider {
    constructor();
  }

  export function getAuth(app?: unknown): unknown;
  export function onAuthStateChanged(
    auth: unknown,
    nextOrObserver: (user: User | null) => void | Promise<void>
  ): () => void;
  export function signInWithEmailAndPassword(
    auth: unknown,
    email: string,
    password: string
  ): Promise<UserCredential>;
  export function signInWithPopup(auth: unknown, provider: GoogleAuthProvider): Promise<UserCredential>;
  export function signOut(auth: unknown): Promise<void>;
}

declare module 'firebase/firestore' {
  export type DocumentData = Record<string, unknown>;

  export interface QueryDocumentSnapshot<T = DocumentData> {
    id: string;
    data(): T;
  }

  export interface QuerySnapshot<T = DocumentData> {
    empty: boolean;
    size: number;
    docs: QueryDocumentSnapshot<T>[];
  }

  export function getFirestore(app?: unknown): unknown;
  export function collection(db: unknown, collectionPath: string): unknown;
  export function doc(db: unknown, collectionPath: string, documentPath: string): unknown;
  export function getDoc(reference: unknown): Promise<{ exists(): boolean; data(): DocumentData }>;
  export function getDocs(queryOrCollection: unknown): Promise<QuerySnapshot>;
  export function limit(limitValue: number): unknown;
  export function query(...queryConstraints: unknown[]): unknown;
  export function where(fieldPath: string, opStr: string, value: unknown): unknown;
}
