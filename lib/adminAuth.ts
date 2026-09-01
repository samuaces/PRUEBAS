// Uses the Web Crypto API (globalThis.crypto.subtle) rather than node:crypto
// so this file works unmodified in both the Node API routes and the Edge
// middleware that gates /admin.

export const ADMIN_COOKIE = 'klym_admin';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — this is the owner's own daily-use device

function secret(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is not set');
  return password;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function checkPassword(candidate: string): boolean {
  return timingSafeStringEqual(candidate, secret());
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sessionToken(): Promise<string> {
  return hmacHex(secret(), 'klym-admin-session');
}

export async function isValidSession(cookieValue: string | undefined | null): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken();
  return timingSafeStringEqual(cookieValue, expected);
}

export const ADMIN_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};
