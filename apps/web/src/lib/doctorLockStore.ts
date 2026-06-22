type LockCodeEntry = {
  code: string;
  expiresAt: number;
  lastSentAt: number;
};

const codeByEmail = new Map<string, LockCodeEntry>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createActivationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function canSendNewCode(email: string): boolean {
  const entry = codeByEmail.get(normalizeEmail(email));
  if (!entry) return true;
  return Date.now() - entry.lastSentAt >= 30_000;
}

export function saveActivationCode(email: string, code: string, ttlMs = 10 * 60 * 1000) {
  const normalized = normalizeEmail(email);
  codeByEmail.set(normalized, {
    code,
    expiresAt: Date.now() + ttlMs,
    lastSentAt: Date.now(),
  });
}

export function verifyActivationCode(email: string, code: string): boolean {
  const normalized = normalizeEmail(email);
  const entry = codeByEmail.get(normalized);

  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    codeByEmail.delete(normalized);
    return false;
  }

  if (entry.code !== code.trim()) {
    return false;
  }

  codeByEmail.delete(normalized);
  return true;
}
