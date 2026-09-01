import { eur } from '@/lib/format';

/** The two-colour bar: paid vs earned. This is the whole point made visual. */
export function ScoreBar({
  paidCents,
  earnedCents,
  height = 8,
}: {
  paidCents: number;
  earnedCents: number;
  height?: number;
}) {
  const total = paidCents + earnedCents;
  const paidPct = total > 0 ? (paidCents / total) * 100 : 100;

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-white/10"
        style={{ height }}
        role="img"
        aria-label={`${eur(paidCents)} paid, ${eur(earnedCents)} earned from traffic`}
      >
        <div className="bg-paid" style={{ width: `${paidPct}%` }} />
        <div className="bg-earned" style={{ width: `${100 - paidPct}%` }} />
      </div>
    </div>
  );
}

export function ScoreLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-white/60">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-paid" /> paid
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-earned" /> earned from traffic
      </span>
    </div>
  );
}
