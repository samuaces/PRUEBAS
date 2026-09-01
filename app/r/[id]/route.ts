import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  clientIp, visitorHash, today,
  looksAutomated, cloudflareVerdict, isDatacentre,
} from '@/lib/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Service role key: server only. It must never reach the browser.
const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** Per-IP ceiling across the whole site, so one address cannot farm many entries. */
const HOURLY_CEILING = 12;
const hourly = new Map<string, { n: number; resetAt: number }>();

function overCeiling(hash: string): boolean {
  const now = Date.now();
  const row = hourly.get(hash);
  if (!row || now > row.resetAt) {
    hourly.set(hash, { n: 1, resetAt: now + 3_600_000 });
    return false;
  }
  row.n++;
  return row.n > HOURLY_CEILING;
}

async function reject(entryId: number | null, reason: string, url: string) {
  if (entryId) {
    await db.from('visit_rejects').insert({ entry_id: entryId, reason, day: today() });
  }
  // The visitor still gets where they were going. We just do not count it.
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: entry } = await db
    .from('entries')
    .select('id, target_url, approved')
    .eq('slug', id)
    .single();

  if (!entry || !entry.approved) {
    return NextResponse.redirect(new URL('/', req.url), 302);
  }

  const dest = entry.target_url;
  const h    = req.headers;
  const ua   = h.get('user-agent') ?? '';
  const ip   = clientIp(h);

  // ---- 1. no IP, nothing to identify ----
  if (!ip) return reject(entry.id, 'no_ip', dest);

  // ---- 2. obvious automation ----
  if (looksAutomated(ua)) return reject(entry.id, 'bot_ua', dest);

  // ---- 3. Cloudflare's verdict, when we have one ----
  if (cloudflareVerdict(h) === 'bot') return reject(entry.id, 'bot_ua', dest);

  // ---- 4. prefetch and preview requests are not people ----
  //     Browsers and chat apps fetch links before anyone clicks them.
  if (h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return reject(entry.id, 'bot_ua', dest);
  }
  if (h.get('sec-fetch-mode') && h.get('sec-fetch-mode') !== 'navigate') {
    return reject(entry.id, 'bot_ua', dest);
  }

  const day  = today();
  const hash = visitorHash(ip, ua, day);

  // ---- 5. per-IP ceiling for the hour ----
  if (overCeiling(hash)) return reject(entry.id, 'rate_limit', dest);

  // ---- 6. servers, VPNs and proxies ----
  if (await isDatacentre(ip)) return reject(entry.id, 'datacentre', dest);

  // ---- 7. count it, once per visitor per entry per day ----
  //     The unique index does the deduping. A duplicate comes back as 23505
  //     and we simply move on, so two simultaneous requests cannot both land.
  const { error } = await db
    .from('visits')
    .insert({ entry_id: entry.id, visitor_hash: hash, day });

  if (error && error.code !== '23505') {
    console.error('visit insert failed', error);
  } else if (error?.code === '23505') {
    await db.from('visit_rejects').insert({ entry_id: entry.id, reason: 'duplicate', day });
  }

  return NextResponse.redirect(dest, 302);
}
