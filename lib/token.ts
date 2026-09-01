import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed owner-link tokens: klym.xyz/e/<token>. No login system — the token
 * itself is the credential, mailed to the entry's owner in their receipt.
 *
 * Deliberately a separate secret from VISITOR_SALT (that one hashes visitor
 * identity; this one authenticates entry owners) so the two purposes never
 * share key material.
 */
const SECRET = process.env.ENTRY_TOKEN_SECRET;
if (!SECRET) throw new Error('ENTRY_TOKEN_SECRET is not set');

function sign(entryId: number): string {
  return createHmac('sha256', SECRET!).update(String(entryId)).digest('base64url').slice(0, 22);
}

export function signEntryToken(entryId: number): string {
  return `${entryId}.${sign(entryId)}`;
}

export function verifyEntryToken(token: string): number | null {
  const [idPart, sig] = token.split('.');
  if (!idPart || !sig) return null;
  const entryId = Number(idPart);
  if (!Number.isInteger(entryId) || entryId <= 0) return null;

  const expected = sign(entryId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return entryId;
}
