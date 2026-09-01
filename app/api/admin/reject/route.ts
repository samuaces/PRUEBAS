import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { stripe } from '@/lib/stripe';
import { sendRejectedEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { entryId } = await req.json().catch(() => ({ entryId: null }));
  const id = Number(entryId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid entry id.' }, { status: 400 });
  }

  const { data: entry, error } = await db
    .from('entries')
    .select('id, name, email, paid_cents, approved, rejected, refunded, stripe_payment_intent_id')
    .eq('id', id)
    .single();

  if (error || !entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  if (entry.rejected) return NextResponse.json({ ok: true }); // already handled, idempotent

  if (!entry.refunded && entry.stripe_payment_intent_id) {
    await stripe.refunds.create({ payment_intent: entry.stripe_payment_intent_id });
  }

  const { error: updateError } = await db
    .from('entries')
    .update({ rejected: true, approved: false, refunded: true, reject_reason: 'manual review' })
    .eq('id', id);
  if (updateError) return NextResponse.json({ error: 'Could not reject entry.' }, { status: 500 });

  if (entry.email) {
    await sendRejectedEmail({ to: entry.email, name: entry.name, amountCents: entry.paid_cents });
  }

  return NextResponse.json({ ok: true });
}
