/**
 * Mirrors the `board` view's scoring formula (db/schema.sql) in JS, so the
 * board page can compute "how to overtake #1" without a round trip.
 * The database view stays the single source of truth for actual scores;
 * this is only ever used to render a hint.
 */

export const CENTS_PER_VISIT = 50;   // EUR 0.50 of score per counted visit
const CAP_NUM = 70;
const CAP_DEN = 30;                  // traffic can supply at most 70% of score

export function trafficCapCents(paidCents: number): number {
  return Math.floor((paidCents * CAP_NUM) / CAP_DEN);
}

export function scoreOf(paidCents: number, visitCount: number) {
  const earnedCents = Math.min(visitCount * CENTS_PER_VISIT, trafficCapCents(paidCents));
  return { earnedCents, scoreCents: paidCents + earnedCents };
}

/** Extra visitors needed (visits alone, paid amount unchanged) to reach targetScoreCents, or null if the 70% cap makes it impossible at this paid level. */
export function extraVisitsToReach(
  paidCents: number,
  visitCount: number,
  targetScoreCents: number
): number | null {
  const { scoreCents } = scoreOf(paidCents, visitCount);
  if (scoreCents >= targetScoreCents) return 0;

  const cap = trafficCapCents(paidCents);
  const neededEarned = targetScoreCents - paidCents;
  if (neededEarned > cap) return null;

  const totalVisitsNeeded = Math.ceil(neededEarned / CENTS_PER_VISIT);
  return Math.max(0, totalVisitsNeeded - visitCount);
}

/** Extra euros (in cents) needed (paid amount alone, visits unchanged) to reach targetScoreCents. */
export function extraMoneyToReach(
  paidCents: number,
  visitCount: number,
  targetScoreCents: number
): number {
  const current = scoreOf(paidCents, visitCount);
  if (current.scoreCents >= targetScoreCents) return 0;

  const trafficValue = visitCount * CENTS_PER_VISIT;

  // Is the entry already past the point where more paid-in money would
  // still be capped by traffic? (cap grows with paid, so once
  // trafficValue <= cap it stays uncapped for every larger paid amount.)
  if (trafficValue <= current.earnedCents) {
    // Uncapped: earned stays fixed at trafficValue as paid grows. Exact, no flooring.
    const neededPaid = targetScoreCents - trafficValue;
    return Math.max(0, neededPaid - paidCents);
  }

  // Still capped at the current paid level. Find the paid amount at which
  // the cap first reaches trafficValue (earned saturates there).
  let pSat = Math.ceil((visitCount * CENTS_PER_VISIT * CAP_DEN) / CAP_NUM);
  while (trafficCapCents(pSat) < trafficValue) pSat++;
  const scoreAtSat = pSat + trafficValue;

  if (targetScoreCents > scoreAtSat) {
    // Target is past saturation: linear regime from here on, exact.
    const neededPaid = targetScoreCents - trafficValue;
    return Math.max(0, neededPaid - paidCents);
  }

  // Still within the capped regime: score(P) = P + floor(P*70/30).
  // Continuous estimate, then a small bounded correction for the floor.
  let p = Math.max(paidCents, Math.ceil((targetScoreCents * CAP_DEN) / (CAP_NUM + CAP_DEN)));
  for (let i = 0; i < 8 && scoreOf(p, visitCount).scoreCents < targetScoreCents; i++) p++;
  return Math.max(0, p - paidCents);
}
