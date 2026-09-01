# klym.xyz

Next.js (App Router) + TypeScript + Supabase + Stripe, deployed on Vercel behind Cloudflare.
A public board: pay to get on it, climb it by sending traffic through your own link.
Score = money paid + traffic brought, traffic capped at 70% of any entry's score.

Full product spec: nothing here should be redesigned — see the "Non-negotiable" section of
`README.md` and the original brief's rules baked into the code (especially `lib/visitor.ts`,
`app/r/[id]/route.ts`, and the `board` view in `db/schema.sql`, which are treated as fixed).

**If you are a Claude Code session picking this up locally: read `DEPLOY.md` next.** It's a
step-by-step runbook for taking this from "code in a repo" to "live at klym.xyz," written to be
followed with minimal input from whoever is running you — it flags exactly which handful of
steps genuinely need a human (account logins, a domain registrar change, a dashboard-only
setting) versus everything else, which you should just do via each service's CLI/API.

## Commands

```bash
npm install
npm run dev         # local dev server, needs .env.local (see .env.example)
npm run build        # production build
npx tsc --noEmit     # typecheck
npx next lint         # lint
```

## Layout

```
db/schema.sql          given, unmodified — entries/visits/board view, the scoring formula,
                        the visit dedup index, visit_velocity
db/002_extend.sql       additive migration: payer email, Stripe idempotency + refund
                        bookkeeping, resolved-URL, rank tracking. Never touches the board view.
lib/visitor.ts          given, unmodified — IP extraction, HMAC visitor hashing, bot/datacentre
                        detection. No raw IP is ever persisted.
app/r/[id]/route.ts     given, unmodified — the 7-check redirect that counts a visit once

lib/stripe.ts                    Stripe client, MIN_ENTRY_CENTS (500 = €5)
app/api/checkout/route.ts        creates the Checkout Session (client input here is untrusted)
app/api/stripe/webhook/route.ts  the ONLY place entry rows get written; verifies the signature,
                                  is idempotent on stripe_session_id, runs the link filter,
                                  refunds+emails on an outright reject
lib/linkFilter.ts        Safe Browsing, redirect-chain resolution (shorteners), RDAP domain age,
                          reachability, optional OpenAI moderation (skipped if no key — never a
                          hard dependency)
lib/token.ts              signs/verifies the no-login klym.xyz/e/<token> owner links
lib/adminAuth.ts + middleware.ts   password → signed cookie, checked in edge middleware, gates
                                    /admin/board and /api/admin/*
app/admin/board/*, app/api/admin/{approve,reject}   phone-first approval queue; reject issues an
                                                     automatic Stripe refund
app/api/cron/tick/route.ts   hourly (vercel.json): auto-refunds anything unapproved >24h, emails
                              owners who got overtaken since the last tick
lib/email.ts               Resend: receipt, approved, rejected, overtaken emails
lib/score.ts                mirrors the board view's formula in JS for the "pay €X more / send Y
                             more visitors" hint — display only, the DB view stays authoritative
app/, components/           board page (30s revalidate), submission form, owner page, legal pages
```

## Conventions

- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, etc.) are read directly
  from `process.env` in server files only — never passed to a client component, never logged.
- Anything the browser sends about price/amount is untrusted; the webhook is the only writer of
  `entries` rows and uses the real Stripe-confirmed amount.
- `middleware.ts` uses the Web Crypto API (`globalThis.crypto.subtle`), not `node:crypto`, because
  it also has to run on Next's Edge runtime.
- Money is always cents (`bigint`/`number`), formatted for display only in `lib/format.ts`'s `eur()`.
