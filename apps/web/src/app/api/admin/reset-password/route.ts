import { NextResponse } from 'next/server';
import { collection, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebaseClient';
import { consumeAdminResetSession } from '@/lib/adminResetStore';

type ResetBody = {
  email?: string;
  newPassword?: string;
  confirmPassword?: string;
  token?: string;
};

async function updateAdminPasswordByEmail(email: string, password: string): Promise<boolean> {
  const collections = ['Admins', 'admins'];
  const emailFields = ['email', 'Email', 'userEmail', 'user_email'];
  const candidates = [email.trim(), email.trim().toLowerCase()];

  for (const collectionName of collections) {
    for (const fieldName of emailFields) {
      for (const candidateEmail of candidates) {
        const snapshot = await getDocs(
          query(collection(firebaseDb, collectionName), where(fieldName, '==', candidateEmail), limit(1))
        );

        if (snapshot.empty) continue;

        const row = snapshot.docs[0];
        await updateDoc(doc(firebaseDb, collectionName, row.id), {
          password,
          updatedAt: new Date().toISOString(),
        });
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResetBody;
    const email = (body.email || '').trim().toLowerCase();
    const newPassword = body.newPassword || '';
    const confirmPassword = body.confirmPassword || '';
    const token = (body.token || '').trim();

    if (!email) {
      return NextResponse.json({ message: 'Admin email is required.' }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ message: 'PIN verification token is required.' }, { status: 401 });
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json({ message: 'New password and confirm password are required.' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ message: 'New password must be at least 8 characters.' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ message: 'Passwords do not match.' }, { status: 400 });
    }

    const validSession = consumeAdminResetSession(email, token);
    if (!validSession) {
      return NextResponse.json({ message: 'PIN verification expired. Please verify your PIN again.' }, { status: 401 });
    }

    const updated = await updateAdminPasswordByEmail(email, newPassword);
    if (!updated) {
      return NextResponse.json({ message: 'No admin account found for that email.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: 'Password changed successfully.' });
  } catch {
    return NextResponse.json({ message: 'Failed to reset password.' }, { status: 500 });
  }
}
