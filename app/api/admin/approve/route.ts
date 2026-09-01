import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { signEntryToken } from '@/lib/token';
import { sendApprovedEmail } from '@/lib/email';

export const runtime = 'nodejs';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const { entryId } = await req.json().catch(() => ({ entryId: null }));
  const id = Number(entryId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid entry id.' }, { status: 400 });
  }

  const { data: entry, error } = await db
    .from('entries')
    .select('id, slug, name, email, approved, rejected')
    .eq('id', id)
    .single();

  if (error || !entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  if (entry.rejected) return NextResponse.json({ error: 'Entry was already rejected.' }, { status: 409 });

  if (!entry.approved) {
    const { error: updateError } = await db.from('entries').update({ approved: true }).eq('id', id);
    if (updateError) return NextResponse.json({ error: 'Could not approve entry.' }, { status: 500 });

    if (entry.email) {
      const ownerUrl = `${siteUrl}/e/${signEntryToken(entry.id)}`;
      const redirectUrl = `${siteUrl}/r/${entry.slug}`;
      await sendApprovedEmail({ to: entry.email, name: entry.name, redirectUrl, ownerUrl });
    }
  }

  return NextResponse.json({ ok: true });
}
