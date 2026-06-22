import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { canSendNewCode, createActivationCode, saveActivationCode } from '@/lib/doctorLockStore';

type SendCodeBody = {
  email?: string;
};

function parsePort(value: string | undefined): number {
  const parsed = Number(value || '587');
  return Number.isFinite(parsed) ? parsed : 587;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendCodeBody;
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
    }

    if (!canSendNewCode(email)) {
      return NextResponse.json(
        { message: 'Please wait at least 30 seconds before requesting another code.' },
        { status: 429 }
      );
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return NextResponse.json(
        {
          message:
            'Email service is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM in apps/web/.env.local.',
        },
        { status: 500 }
      );
    }

    const code = createActivationCode();

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parsePort(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'AfyaMama lock screen activation code',
      text: `Your AfyaMama activation code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your AfyaMama activation code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
    });

    saveActivationCode(email, code);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Failed to send activation code.' }, { status: 500 });
  }
}
