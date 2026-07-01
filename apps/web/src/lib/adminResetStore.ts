type ResetSession = {
  email: string;
  expiresAt: number;
};

const resetSessions = new Map<string, ResetSession>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function randomToken(length = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function createAdminResetSession(email: string, ttlMs = 10 * 60 * 1000): string {
  const token = randomToken();
  resetSessions.set(token, {
    email: normalizeEmail(email),
    expiresAt: Date.now() + ttlMs,
  });
  return token;
}

export function consumeAdminResetSession(email: string, token: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = token.trim();
  if (!normalizedToken) return false;

  const entry = resetSessions.get(normalizedToken);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    resetSessions.delete(normalizedToken);
    return false;
  }

  if (entry.email !== normalizedEmail) {
    return false;
  }

  resetSessions.delete(normalizedToken);
  return true;
}
