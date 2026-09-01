import { NextRequest, NextResponse } from 'next/server';
import { stripe, MIN_ENTRY_CENTS } from '@/lib/stripe';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  let body: { name?: string; targetUrl?: string; email?: string; amountEur?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim().slice(0, 80);
  const email = (body.email ?? '').trim().slice(0, 200);
  let targetUrl = (body.targetUrl ?? '').trim();

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });

  try {
    const u = new URL(targetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    targetUrl = u.toString();
  } catch {
    return NextResponse.json({ error: 'A valid link is required.' }, { status: 400 });
  }

  const amountEur = Number(body.amountEur);
  if (!Number.isFinite(amountEur)) {
    return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
  }
  const amountCents = Math.round(amountEur * 100);
  if (amountCents < MIN_ENTRY_CENTS) {
    return NextResponse.json({ error: 'Minimum entry is €5.' }, { status: 400 });
  }

  // Anything about the amount the client claims here is untrusted display
  // only — this value is what actually gets charged, and the entry itself
  // is written only once Stripe confirms payment via the webhook.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: {
            name: `klym.xyz board entry — ${name}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      entry_name: name,
      entry_target_url: targetUrl,
      entry_email: email,
    },
    success_url: `${siteUrl}/submit/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/submit`,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
