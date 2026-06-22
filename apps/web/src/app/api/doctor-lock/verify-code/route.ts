import { NextResponse } from 'next/server';
import { verifyActivationCode } from '@/lib/doctorLockStore';

type VerifyCodeBody = {
  email?: string;
  code?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyCodeBody;
    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim();

    if (!email || !code) {
      return NextResponse.json({ message: 'Email and code are required.' }, { status: 400 });
    }

    const isValid = verifyActivationCode(email, code);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid or expired activation code.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Failed to verify activation code.' }, { status: 500 });
  }
}
