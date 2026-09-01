'use client';

import { useState } from 'react';
import { eur } from '@/lib/format';

type Entry = {
  id: number;
  name: string;
  target_url: string;
  resolved_url: string | null;
  paid_cents: number;
  email: string | null;
  created_at: string;
};

export function EntryCard({ entry }: { entry: Entry }) {
  const [status, setStatus] = useState<'pending' | 'busy' | 'approved' | 'rejected'>('pending');

  async function act(action: 'approve' | 'reject') {
    setStatus('busy');
    const res = await fetch(`/api/admin/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id }),
    });
    if (res.ok) {
      setStatus(action === 'approve' ? 'approved' : 'rejected');
    } else {
      setStatus('pending');
      alert('Something went wrong. Try again.');
    }
  }

  if (status === 'approved') return <Card entry={entry} note="Approved — now live." tone="paid" />;
  if (status === 'rejected') return <Card entry={entry} note="Rejected — refunded." tone="red" />;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{entry.name}</span>
        <span className="text-sm font-medium">{eur(entry.paid_cents)}</span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Destination" value={entry.target_url} link />
        {entry.resolved_url && entry.resolved_url !== entry.target_url && (
          <Row label="Resolves to" value={entry.resolved_url} link />
        )}
        <Row label="Email" value={entry.email ?? '—'} />
        <Row label="Submitted" value={new Date(entry.created_at).toLocaleString()} />
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => act('reject')}
          disabled={status === 'busy'}
          className="rounded-lg bg-red-500/15 py-4 text-base font-semibold text-red-300 active:bg-red-500/25 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={() => act('approve')}
          disabled={status === 'busy'}
          className="rounded-lg bg-green-500/15 py-4 text-base font-semibold text-green-300 active:bg-green-500/25 disabled:opacity-50"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-white/40">{label}</dt>
      <dd className="min-w-0 truncate">
        {link ? (
          <a href={value} target="_blank" rel="noreferrer noopener nofollow" className="underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Card({ entry, note, tone }: { entry: Entry; note: string; tone: 'paid' | 'red' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 opacity-60">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{entry.name}</span>
        <span className={`text-sm ${tone === 'paid' ? 'text-green-300' : 'text-red-300'}`}>{note}</span>
      </div>
    </div>
  );
}
