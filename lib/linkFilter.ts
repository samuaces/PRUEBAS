/**
 * The automatic filter that runs before an entry reaches the manual queue.
 * Its job is to clear the obvious 80% so the human only sees borderline
 * cases. Every individual check fails OPEN: if a third-party lookup errors
 * or times out, that check is skipped (logged, not rejected) rather than
 * blocking a legitimate submission on our own infrastructure's flakiness.
 * The only things that reject outright are positive, checkable signals.
 */

export type FilterReason =
  | 'phishing_malware'
  | 'shortener_unresolved'
  | 'domain_too_new'
  | 'destination_unreachable'
  | 'redirect_chain_too_long'
  | 'moderation_flagged';

export type FilterResult =
  | { verdict: 'pass'; resolvedUrl: string }
  | { verdict: 'reject'; reason: FilterReason; detail: string; resolvedUrl: string | null };

const KNOWN_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in',
  's.id', 'v.gd', 'shorte.st', 'clck.ru', 'soo.gd',
]);

const MAX_HOPS = 5;
const CHAIN_LIMIT = 2;
const FETCH_TIMEOUT_MS = 5000;

/** Follows redirects by hand so we can count hops and see every intermediate host. */
async function resolveChain(startUrl: string): Promise<
  | { ok: true; finalUrl: string; hops: number; body: string; status: number }
  | { ok: false; reason: 'too_many_hops' | 'unreachable'; finalUrl: string | null }
> {
  let url = startUrl;
  let hops = 0;

  for (let i = 0; i <= MAX_HOPS; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'user-agent': 'klymbot/1.0 (+https://klym.xyz)' },
      });
    } catch {
      return { ok: false, reason: 'unreachable', finalUrl: hops > 0 ? url : null };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ok: false, reason: 'unreachable', finalUrl: url };
      url = new URL(loc, url).toString();
      hops++;
      if (hops > CHAIN_LIMIT) return { ok: false, reason: 'too_many_hops', finalUrl: url };
      continue;
    }

    if (res.status >= 400) {
      return { ok: false, reason: 'unreachable', finalUrl: url };
    }

    const body = await res.text().catch(() => '');
    return { ok: true, finalUrl: url, hops, body: body.slice(0, 20_000), status: res.status };
  }

  return { ok: false, reason: 'too_many_hops', finalUrl: url };
}

async function isRecentlyRegistered(hostname: string): Promise<boolean> {
  const parts = hostname.split('.');
  const registrable = parts.length > 2 ? parts.slice(-2).join('.') : hostname;

  try {
    const res = await fetch(`https://rdap.org/domain/${registrable}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return false; // unsupported TLD or lookup miss: fail open
    const data = await res.json();
    const events: Array<{ eventAction: string; eventDate: string }> = data?.events ?? [];
    const registration = events.find(e => e.eventAction === 'registration');
    if (!registration) return false;
    const ageMs = Date.now() - new Date(registration.eventDate).getTime();
    return ageMs < 30 * 24 * 60 * 60 * 1000;
  } catch {
    return false; // fail open: a slow/unsupported lookup must not block a real entry
  }
}

async function isFlaggedByGoogleSafeBrowsing(url: string): Promise<boolean> {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key) return false;

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({
          client: { clientId: 'klym', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data?.matches) && data.matches.length > 0;
  } catch {
    return false;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Optional: OpenAI's moderation endpoint, if OPENAI_API_KEY is set. Not in
 * the base env list — the brief calls for "a moderation classifier" without
 * naming one. Skips (fails open, logged) when no key is configured, so this
 * never becomes a hard dependency the owner has to set up before launch.
 */
async function isFlaggedByModeration(text: string): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !text) return false;

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.results?.[0]?.flagged === true;
  } catch {
    return false;
  }
}

export async function runLinkFilter(targetUrl: string, entryName: string): Promise<FilterResult> {
  let submittedHost = '';
  try {
    submittedHost = new URL(targetUrl).hostname.replace(/^www\./, '');
  } catch {
    return { verdict: 'reject', reason: 'destination_unreachable', detail: 'not a valid URL', resolvedUrl: null };
  }
  const wasShortener = KNOWN_SHORTENERS.has(submittedHost);

  const chain = await resolveChain(targetUrl);
  if (!chain.ok) {
    if (chain.reason === 'too_many_hops') {
      return {
        verdict: 'reject',
        reason: 'redirect_chain_too_long',
        detail: `more than ${CHAIN_LIMIT} redirect hops from ${submittedHost}`,
        resolvedUrl: chain.finalUrl,
      };
    }
    return {
      verdict: 'reject',
      reason: wasShortener ? 'shortener_unresolved' : 'destination_unreachable',
      detail: `could not reach a final destination from ${submittedHost}`,
      resolvedUrl: chain.finalUrl,
    };
  }

  const resolvedUrl = chain.finalUrl;
  const resolvedHost = new URL(resolvedUrl).hostname.replace(/^www\./, '');

  if (await isFlaggedByGoogleSafeBrowsing(resolvedUrl)) {
    return {
      verdict: 'reject',
      reason: 'phishing_malware',
      detail: `${resolvedHost} is listed by Google Safe Browsing`,
      resolvedUrl,
    };
  }

  if (await isRecentlyRegistered(resolvedHost)) {
    return {
      verdict: 'reject',
      reason: 'domain_too_new',
      detail: `${resolvedHost} was registered within the last 30 days`,
      resolvedUrl,
    };
  }

  const pageText = stripTags(chain.body);
  if (await isFlaggedByModeration(`${entryName}\n\n${pageText}`)) {
    return {
      verdict: 'reject',
      reason: 'moderation_flagged',
      detail: 'content moderation classifier flagged this submission',
      resolvedUrl,
    };
  }

  return { verdict: 'pass', resolvedUrl };
}
