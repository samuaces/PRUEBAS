import Link from 'next/link';
import { db } from '@/lib/supabaseAdmin';
import { TopSlot } from '@/components/TopSlot';
import { BoardRow } from '@/components/BoardRow';

export const revalidate = 30;

type BoardRowData = {
  id: number;
  slug: string;
  name: string;
  paid_cents: number;
  visit_count: number;
  earned_cents: number;
  score_cents: number;
};

async function getBoard(): Promise<BoardRowData[]> {
  const { data, error } = await db
    .from('board')
    .select('id, slug, name, paid_cents, visit_count, earned_cents, score_cents')
    .order('score_cents', { ascending: false });

  if (error) {
    console.error('failed to load board', error);
    return [];
  }
  return data ?? [];
}

export default async function BoardPage() {
  const rows = await getBoard();
  const [top, ...rest] = rows;

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-lg font-bold">klym</h1>
        <p className="mt-1 text-sm text-white/60">
          Pay to get on the board. Climb it by sending people through your own link.
          Traffic can supply at most 70% of a score — money always has to be on the board too.
        </p>
        <Link
          href="/submit"
          className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
        >
          Get on the board — from €5
        </Link>
      </header>

      {top ? (
        <TopSlot
          name={top.name}
          slug={top.slug}
          paidCents={top.paid_cents}
          earnedCents={top.earned_cents}
          visitCount={top.visit_count}
          runnerUpScoreCents={rest[0]?.score_cents ?? null}
        />
      ) : (
        <div className="rounded-2xl border border-white/10 p-8 text-center text-white/50">
          Nobody&rsquo;s on the board yet. Be the first.
        </div>
      )}

      {rest.length > 0 && (
        <section className="mt-8">
          <div className="divide-y divide-white/5">
            {rest.map((row, i) => (
              <BoardRow
                key={row.id}
                rank={i + 2}
                name={row.name}
                slug={row.slug}
                paidCents={row.paid_cents}
                earnedCents={row.earned_cents}
                visitCount={row.visit_count}
              />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-16 flex flex-wrap gap-4 text-xs text-white/40">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/legal">Legal notice</Link>
        <a href="mailto:info@cuantomedeben.es">info@cuantomedeben.es</a>
      </footer>
    </main>
  );
}
