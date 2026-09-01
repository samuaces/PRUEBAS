import { eur } from '@/lib/format';
import { ScoreBar } from '@/components/ScoreBar';

export function BoardRow({
  rank,
  name,
  slug,
  paidCents,
  earnedCents,
  visitCount,
}: {
  rank: number;
  name: string;
  slug: string;
  paidCents: number;
  earnedCents: number;
  visitCount: number;
}) {
  const scoreCents = paidCents + earnedCents;

  return (
    <a
      href={`/r/${slug}`}
      className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-3 hover:bg-white/5 sm:grid-cols-[2.5rem_1fr_auto]"
    >
      <span className="text-sm text-white/40 tabular-nums">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className="mt-1 block max-w-[240px]">
          <ScoreBar paidCents={paidCents} earnedCents={earnedCents} height={5} />
        </span>
        <span className="mt-1 block text-xs text-white/40">
          {eur(paidCents)} paid &middot; {visitCount.toLocaleString()} visitors
        </span>
      </span>
      <span className="text-right text-sm font-semibold tabular-nums">{eur(scoreCents)}</span>
    </a>
  );
}
