import { notFound } from 'next/navigation';
import { db } from '@/lib/supabaseAdmin';
import { verifyEntryToken } from '@/lib/token';
import { scoreOf, extraMoneyToReach, extraVisitsToReach } from '@/lib/score';
import { eur } from '@/lib/format';
import { ScoreBar, ScoreLegend } from '@/components/ScoreBar';

export const dynamic = 'force-dynamic';

export default async function OwnerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entryId = verifyEntryToken(token);
  if (!entryId) notFound();

  const { data: entry } = await db
    .from('entries')
    .select('id, slug, name, paid_cents, visit_count, approved, rejected, reject_reason')
    .eq('id', entryId)
    .single();

  if (!entry) notFound();

  if (entry.rejected) {
    return (
      <main className="text-center">
        <h1 className="text-lg font-bold">{entry.name}</h1>
        <p className="mt-2 text-sm text-white/60">
          This submission was not approved{entry.reject_reason ? ` (${entry.reject_reason})` : ''}. It was refunded
          in full.
        </p>
      </main>
    );
  }

  if (!entry.approved) {
    return (
      <main className="text-center">
        <h1 className="text-lg font-bold">{entry.name}</h1>
        <p className="mt-2 text-sm text-white/60">
          Still under review. You&rsquo;ll get an email as soon as it&rsquo;s decided — automatically refunded if
          nobody&rsquo;s looked at it within 24 hours.
        </p>
      </main>
    );
  }

  const { data: approvedEntries } = await db
    .from('entries')
    .select('id, paid_cents, visit_count')
    .eq('approved', true)
    .eq('rejected', false);

  const ranked = (approvedEntries ?? [])
    .map(e => ({ id: e.id, scoreCents: scoreOf(e.paid_cents, e.visit_count).scoreCents }))
    .sort((a, b) => b.scoreCents - a.scoreCents);

  const rank = ranked.findIndex(e => e.id === entry.id) + 1;
  const above = rank > 1 ? ranked[rank - 2] : null; // the entry directly above this one

  const { earnedCents, scoreCents } = scoreOf(entry.paid_cents, entry.visit_count);
  const redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/r/${entry.slug}`;

  const target = above ? above.scoreCents + 1 : null;
  const moneyNeeded = target !== null ? extraMoneyToReach(entry.paid_cents, entry.visit_count, target) : null;
  const visitsNeeded = target !== null ? extraVisitsToReach(entry.paid_cents, entry.visit_count, target) : null;

  return (
    <main>
      <h1 className="text-lg font-bold">{entry.name}</h1>
      <p className="mt-1 text-sm text-white/60">Rank #{rank} of {ranked.length}</p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-wider text-white/40">Your link</p>
        <a href={redirectUrl} className="mt-1 block break-all text-blue-400 underline">
          {redirectUrl}
        </a>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{eur(scoreCents)}</span>
          <span className="text-sm text-white/50">score</span>
        </div>
        <div className="mt-3">
          <ScoreBar paidCents={entry.paid_cents} earnedCents={earnedCents} height={10} />
          <div className="mt-2 flex items-center justify-between">
            <ScoreLegend />
            <span className="text-xs text-white/50">{entry.visit_count.toLocaleString()} visitors sent</span>
          </div>
        </div>
      </div>

      {rank > 1 && above && (
        <p className="mt-6 rounded-lg bg-white/5 p-4 text-sm text-white/80">
          To pass rank #{rank - 1}: pay <strong>{moneyNeeded !== null ? eur(moneyNeeded) : '—'} more</strong>, or
          send <strong>{visitsNeeded !== null ? `${visitsNeeded.toLocaleString()} more visitors` : 'more than traffic alone can supply'}</strong>.
        </p>
      )}
    </main>
  );
}
