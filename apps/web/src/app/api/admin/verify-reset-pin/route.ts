import { NextResponse } from 'next/server';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
import { createAdminResetSession } from '@/lib/adminResetStore';

type VerifyBody = {
  email?: string;
  pin?: string;
};

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function normalizePin(value: unknown): string {
  return normalizeText(value);
}

async function validateAdminPinByEmail(email: string, pin: string): Promise<boolean> {
  const collections = ['Admins', 'admins'];
  const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
  const pinFields = ['pin', 'PIN', 'adminPin', 'admin_pin', ];
  const candidates = [email.trim(), email.trim().toLowerCase()];

  for (const collectionName of collections) {
    for (const fieldName of emailFields) {
      for (const candidateEmail of candidates) {
        const snapshot = await getDocs(
          query(collection(firebaseDb, collectionName), where(fieldName, '==', candidateEmail), limit(1))
        );

        if (snapshot.empty) continue;

        const data = snapshot.docs[0].data() as Record<string, unknown>;
        const storedPin = pinFields
          .map((field) => normalizePin(data[field]))
          .find((value) => Boolean(value));

        return Boolean(storedPin && storedPin === pin);
      }
    }

    // Fallback for mixed-case/alternate email field values not matched by indexed where queries.
    const fullSnapshot = await getDocs(collection(firebaseDb, collectionName));
    for (const row of fullSnapshot.docs) {
      const data = row.data() as Record<string, unknown>;
      const candidateEmail = emailFields
        .map((field) => normalizeEmail(data[field]))
        .find((value) => Boolean(value));

      if (!candidateEmail || candidateEmail !== email.toLowerCase()) {
        continue;
      }

      const storedPin = pinFields
        .map((field) => normalizePin(data[field]))
        .find((value) => Boolean(value));

      if (storedPin && storedPin === pin) {
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyBody;
    const email = normalizeEmail(body.email);
    const pin = normalizePin(body.pin);

    if (!email) {
      return NextResponse.json({ message: 'Admin email is required.' }, { status: 400 });
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ message: 'Enter a valid 4-digit PIN.' }, { status: 400 });
    }

    const isValid = await validateAdminPinByEmail(email, pin);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid admin PIN for this email.' }, { status: 401 });
    }

    const token = createAdminResetSession(email);
    return NextResponse.json({ ok: true, token });
  } catch {
    return NextResponse.json({ message: 'Could not verify admin PIN.' }, { status: 500 });
  }
}
