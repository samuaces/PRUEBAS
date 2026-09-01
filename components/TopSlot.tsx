import { eur } from '@/lib/format';
import { ScoreBar, ScoreLegend } from '@/components/ScoreBar';
import { extraMoneyToReach, extraVisitsToReach } from '@/lib/score';

export function TopSlot({
  name,
  slug,
  paidCents,
  earnedCents,
  visitCount,
  runnerUpScoreCents,
}: {
  name: string;
  slug: string;
  paidCents: number;
  earnedCents: number;
  visitCount: number;
  runnerUpScoreCents: number | null;
}) {
  const scoreCents = paidCents + earnedCents;
  const target = runnerUpScoreCents !== null ? runnerUpScoreCents + 1 : null;
  const moneyToOvertake = target !== null ? extraMoneyToReach(paidCents, visitCount, target) : null;
  const visitsToOvertake = target !== null ? extraVisitsToReach(paidCents, visitCount, target) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 sm:p-8">
      <p className="text-xs uppercase tracking-wider text-white/50">#1 right now</p>
      <a
        href={`/r/${slug}`}
        className="mt-2 block text-3xl font-bold leading-tight hover:underline sm:text-4xl"
      >
        {name}
      </a>
      <p className="mt-1 text-sm text-white/50">klym.xyz/r/{slug}</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{eur(scoreCents)}</span>
        <span className="text-sm text-white/50">score</span>
      </div>
      <div className="mt-3">
        <ScoreBar paidCents={paidCents} earnedCents={earnedCents} height={10} />
        <div className="mt-2 flex items-center justify-between">
          <ScoreLegend />
          <span className="text-xs text-white/50">{visitCount.toLocaleString()} visitors sent</span>
        </div>
      </div>

      {target !== null && (
        <p className="mt-6 rounded-lg bg-white/5 p-4 text-sm text-white/80">
          To take #1 from {name}: pay <strong>{moneyToOvertake !== null ? eur(moneyToOvertake) : '—'} more</strong>,
          {' '}or send{' '}
          <strong>{visitsToOvertake !== null ? `${visitsToOvertake.toLocaleString()} more visitors` : "more than traffic alone can supply"}</strong>
          {visitsToOvertake === null ? '' : ''} — whichever combination of the two gets there first.
          {visitsToOvertake === null && (
            <> Traffic alone can&rsquo;t do it: at least part of it has to be paid.</>
          )}
        </p>
      )}
    </div>
  );
}
