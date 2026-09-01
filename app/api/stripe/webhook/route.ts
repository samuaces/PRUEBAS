import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/supabaseAdmin';
import { runLinkFilter } from '@/lib/linkFilter';
import { signEntryToken } from '@/lib/token';
import { sendReceiptEmail, sendRejectedEmail } from '@/lib/email';
import { slugify } from '@/lib/format';

export const runtime = 'nodejs';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'entry';
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await db.from('entries').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Idempotency: the Checkout Session id is unique per payment. A replayed
  // webhook for a session we've already recorded is a no-op.
  const { data: existing } = await db
    .from('entries')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (existing) return;

  const name = (session.metadata?.entry_name ?? '').slice(0, 80) || 'Untitled';
  const targetUrl = session.metadata?.entry_target_url ?? '';
  const email = session.metadata?.entry_email ?? session.customer_email ?? '';
  const paidCents = session.amount_total ?? 0;
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  const slug = await uniqueSlug(name);

  const { data: entry, error: insertError } = await db
    .from('entries')
    .insert({
      slug,
      name,
      target_url: targetUrl,
      paid_cents: paidCents,
      approved: false,
      email,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId ?? null,
    })
    .select('id, name, target_url, paid_cents, email')
    .single();

  // Unique-index race: another webhook delivery beat us to it.
  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') return;
    console.error('failed to insert entry from webhook', insertError);
    throw insertError;
  }

  const filterResult = await runLinkFilter(entry.target_url, entry.name);

  if (filterResult.verdict === 'reject') {
    await db.from('filter_rejections').insert({
      entry_id: entry.id,
      reason: filterResult.reason,
      detail: filterResult.detail,
    });

    if (paymentIntentId) {
      await stripe.refunds.create({ payment_intent: paymentIntentId });
    }

    await db
      .from('entries')
      .update({ rejected: true, reject_reason: filterResult.reason, refunded: true })
      .eq('id', entry.id);

    if (entry.email) {
      await sendRejectedEmail({
        to: entry.email,
        name: entry.name,
        amountCents: entry.paid_cents,
        reason: filterResult.detail,
      });
    }
    return;
  }

  // Passed the automatic filter: queued for manual approval.
  await db.from('entries').update({ resolved_url: filterResult.resolvedUrl }).eq('id', entry.id);

  if (entry.email) {
    const ownerUrl = `${siteUrl}/e/${signEntryToken(entry.id)}`;
    await sendReceiptEmail({
      to: entry.email,
      name: entry.name,
      amountCents: entry.paid_cents,
      ownerUrl,
    });
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('stripe signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }
  } catch (err) {
    console.error('webhook handler failed', err);
    // 500 so Stripe retries; the idempotency check above makes retries safe.
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
