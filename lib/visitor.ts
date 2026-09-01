import { createHmac } from 'crypto';

/**
 * Turning a request into a visitor identity, without storing anyone's IP.
 *
 * Raw IP addresses are personal data under GDPR. We never write one to the
 * database. Instead we keep an HMAC of (ip + user agent + today), which is
 * one-way, and rotates daily because the date is inside the hash.
 */

const SECRET = process.env.VISITOR_SALT;
if (!SECRET) throw new Error('VISITOR_SALT is not set');

/**
 * The client IP.
 *
 * x-forwarded-for is a list the proxies append to, and anyone can send a fake
 * one. Only the entries added by YOUR proxy can be trusted, and that is the
 * rightmost part. Vercel and Cloudflare both put the real client IP in their
 * own header, so prefer those and never trust a raw x-forwarded-for value.
 */
export function clientIp(h: Headers): string | null {
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const vercel = h.get('x-real-ip');
  if (vercel) return vercel.trim();

  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? null;   // rightmost, not leftmost
  }
  return null;
}

export function visitorHash(ip: string, userAgent: string, day: string): string {
  return createHmac('sha256', SECRET!)
    .update(`${ip}|${userAgent}|${day}`)
    .digest('hex');
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Obvious automated clients. This catches crawlers and lazy scripts,
 * not anything that is trying to hide.
 */
const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|axios|go-http|java\/|okhttp|scrapy|semrush|ahrefs|dataprovider|facebookexternalhit|preview/i;

export function looksAutomated(userAgent: string): boolean {
  if (!userAgent || userAgent.length < 20) return true;   // real browsers send long UA strings
  return BOT_UA.test(userAgent);
}

/**
 * Datacentre detection.
 *
 * Bought traffic comes from servers, not from phones. Cheap bot farms run on
 * AWS, Hetzner, DigitalOcean and similar, and those are easy to reject.
 *
 * Two ways to know, best first:
 *
 *  1. Put the site behind Cloudflare (free). It adds a bot score to every
 *     request and it is better than anything we could write here.
 *  2. Fall back to an ASN lookup, cached so we do not call it per request.
 *
 * What neither of these catches: residential proxies. Those come from real
 * home connections and are indistinguishable from real visitors. The 70% cap
 * on traffic score is what limits the damage, not this function.
 */
export function cloudflareVerdict(h: Headers): 'bot' | 'human' | 'unknown' {
  const score = h.get('cf-bot-score');            // needs Bot Management
  if (score) return Number(score) < 30 ? 'bot' : 'human';

  const verified = h.get('cf-verified-bot');
  if (verified === 'true') return 'bot';

  return 'unknown';
}

const asnCache = new Map<string, { datacentre: boolean; at: number }>();
const ASN_TTL = 24 * 60 * 60 * 1000;

const DATACENTRE_HINT = /amazon|aws|google|microsoft|azure|digitalocean|hetzner|ovh|linode|vultr|contabo|choopa|leaseweb|scaleway|oracle|alibaba|tencent|colo|hosting|server|cloud|vpn|proxy|datacenter|datacentre/i;

export async function isDatacentre(ip: string): Promise<boolean> {
  const hit = asnCache.get(ip);
  if (hit && Date.now() - hit.at < ASN_TTL) return hit.datacentre;

  try {
    // ipapi.is and ipinfo both have free tiers. Swap in whichever you use.
    const r = await fetch(`https://ipapi.is/json/?q=${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!r.ok) return false;                       // never block a real visit on a failed lookup
    const d = await r.json();

    const flagged =
      d?.is_datacenter === true ||
      d?.is_vpn === true ||
      d?.is_proxy === true ||
      d?.is_tor === true ||
      DATACENTRE_HINT.test(d?.asn?.org ?? '');

    asnCache.set(ip, { datacentre: flagged, at: Date.now() });
    return flagged;
  } catch {
    return false;                                  // fail open: a slow lookup must not cost a real visit
  }
}
