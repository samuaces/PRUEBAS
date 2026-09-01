'use client';

import { useState } from 'react';

export default function SubmitPage() {
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, targetUrl, email, amountEur: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <main className="max-w-md">
      <h1 className="text-lg font-bold">Get on the board</h1>
      <p className="mt-1 text-sm text-white/60">
        Minimum €5. Your money counts toward your score directly; visitors you send add the rest,
        up to 70% of your total. A human reviews every submission before it goes live.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-white/70">Name</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            placeholder="Your project name"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70">Link</label>
          <input
            required
            type="url"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70">Email (for your receipt and board link)</label>
          <input
            required
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-white/70">Amount (EUR, minimum 5)</label>
          <input
            required
            type="number"
            min={5}
            step={1}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? 'Redirecting to payment…' : 'Continue to payment'}
        </button>
      </form>
    </main>
  );
}
