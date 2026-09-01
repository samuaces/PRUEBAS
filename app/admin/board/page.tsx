import { db } from '@/lib/supabaseAdmin';
import { EntryCard } from '@/components/EntryCard';

export const dynamic = 'force-dynamic';

async function getPending() {
  const { data, error } = await db
    .from('entries')
    .select('id, name, target_url, resolved_url, paid_cents, email, created_at')
    .eq('approved', false)
    .eq('rejected', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('failed to load admin queue', error);
    return [];
  }
  return data ?? [];
}

export default async function AdminBoardPage() {
  const pending = await getPending();

  return (
    <main>
      <h1 className="text-lg font-bold">Queue</h1>
      <p className="mt-1 text-sm text-white/60">{pending.length} waiting</p>

      <div className="mt-6 space-y-4">
        {pending.length === 0 && <p className="text-sm text-white/40">Nothing waiting. Nice.</p>}
        {pending.map(entry => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </main>
  );
}
