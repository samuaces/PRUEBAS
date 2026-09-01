import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabaseAdmin';
import { stripe } from '@/lib/stripe';
import { sendOvertakenEmail, sendRejectedEmail } from '@/lib/email';
import { signEntryToken } from '@/lib/token';
import { scoreOf } from '@/lib/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured, no runs
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function refundStaleUnapproved() {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

  const { data: stale, error } = await db
    .from('entries')
    .select('id, name, email, paid_cents, stripe_payment_intent_id, refunded')
    .eq('approved', false)
    .eq('rejected', false)
    .lt('created_at', cutoff);

  if (error) {
    console.error('cron: failed to load stale entries', error);
    return 0;
  }

  for (const entry of stale ?? []) {
    if (!entry.refunded && entry.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({ payment_intent: entry.stripe_payment_intent_id });
      } catch (err) {
        console.error(`cron: refund failed for entry ${entry.id}`, err);
        continue; // don't mark it handled if the refund didn't go through
      }
    }

    await db
      .from('entries')
      .update({ rejected: true, refunded: true, reject_reason: 'auto: unreviewed after 24 hours' })
      .eq('id', entry.id);

    if (entry.email) {
      await sendRejectedEmail({
        to: entry.email,
        name: entry.name,
        amountCents: entry.paid_cents,
        reason: 'not reviewed in time',
      });
    }
  }

  return stale?.length ?? 0;
}

async function checkOvertakes() {
  const { data: approved, error } = await db
    .from('entries')
    .select('id, slug, name, email, paid_cents, visit_count, last_known_rank')
    .eq('approved', true)
    .eq('rejected', false);

  if (error) {
    console.error('cron: failed to load approved entries', error);
    return 0;
  }

  const ranked = (approved ?? [])
    .map(e => ({ ...e, scoreCents: scoreOf(e.paid_cents, e.visit_count).scoreCents }))
    .sort((a, b) => b.scoreCents - a.scoreCents)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  let notified = 0;
  for (const entry of ranked) {
    const wasKnown = entry.last_known_rank !== null;
    const droppedInRank = wasKnown && entry.rank > (entry.last_known_rank as number);

    if (droppedInRank && entry.email) {
      const ownerUrl = `${siteUrl}/e/${signEntryToken(entry.id)}`;
      await sendOvertakenEmail({ to: entry.email, name: entry.name, ownerUrl, newRank: entry.rank });
      notified++;
    }

    if (entry.rank !== entry.last_known_rank) {
      await db.from('entries').update({ last_known_rank: entry.rank }).eq('id', entry.id);
    }
  }

  return notified;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const [refunded, notified] = await Promise.all([refundStaleUnapproved(), checkOvertakes()]);

  return NextResponse.json({ refunded, notified });
}
