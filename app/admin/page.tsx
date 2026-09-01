'use client';

import { useState } from 'react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = '/admin/board';
    } else {
      setError('Wrong password.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-3">
        <h1 className="text-center text-lg font-bold">klym admin</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-base outline-none focus:border-white/40"
        />
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-3 text-base font-semibold text-black disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
