# klym.xyz

A public board. You pay to get on it. You climb it by sending people through your own link.
Score = money paid + traffic brought, traffic capped at 70% of any entry's score.

## What's here

```
db/schema.sql        given, unmodified — entries/visits/board view, the scoring formula
db/002_extend.sql     additive migration: payer email, Stripe idempotency + refund bookkeeping,
                      resolved-URL + rank tracking. Does not touch the board view or its math.
lib/visitor.ts        given, unmodified — IP handling, visitor hashing, bot/datacentre detection
app/r/[id]/route.ts   given, unmodified — the 7-check redirect that counts a visit

lib/stripe.ts, app/api/checkout, app/api/stripe/webhook   Stripe Checkout + webhook
lib/linkFilter.ts      the automatic pre-approval filter (§4.2)
lib/token.ts            signed klym.xyz/e/<token> owner links, no login system
lib/adminAuth.ts, middleware.ts, app/admin/*, app/api/admin/*    password-gated mobile approval queue
app/api/cron/tick       hourly: refunds anything unapproved after 24h, emails overtaken owners
lib/email.ts             Resend: receipt, approved, rejected, overtaken emails
app/, components/        the board itself, submission form, owner page, legal pages
```

## Two things added beyond the brief's env list

The brief's environment section didn't include these, but the features it asks for need them:

- **`ENTRY_TOKEN_SECRET`** — signs the `klym.xyz/e/<token>` owner links ("a signed token in the
  URL is enough", §4.5). Deliberately a separate secret from `VISITOR_SALT` so visitor-hashing
  and owner-authentication never share key material.
- **`CRON_SECRET`** — Vercel automatically sends this as a Bearer token to any cron-triggered
  request when the env var is set; `/api/cron/tick` refuses to run without it (fails closed, not
  open, if unset).

Generate both with `openssl rand -hex 32`, same as `VISITOR_SALT`.

## Setup

### 1. Supabase
Run `db/schema.sql`, then `db/002_extend.sql`, in the SQL editor, in that order.

### 2. Environment variables
Copy `.env.example` to `.env.local` (and set the same in Vercel's project settings). All values
in `.env.example` are required except `OPENAI_API_KEY`, which is optional — see below.

### 3. Stripe
- Create a webhook endpoint pointing at `https://klym.xyz/api/stripe/webhook`, subscribed to
  `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- Test with Stripe's test card (`4242 4242 4242 4242`) before switching to live keys.

### 4. Content moderation (optional)
`lib/linkFilter.ts`'s moderation check only runs if `OPENAI_API_KEY` is set (OpenAI's
`omni-moderation-latest` endpoint, free). The brief asked for "a moderation classifier" without
naming one; without a key this single check is skipped — every other filter check (Safe
Browsing, domain age, redirect chain, reachability) still runs regardless.

### 5. Resend
Verify a sending domain for `info@cuantomedeben.es` (or whatever `EMAIL_FROM` you set) in Resend,
otherwise transactional emails will fail or land in spam.

### 6. Deploy
- Push to Vercel, connect the `klym.xyz` domain.
- The hourly cron (`vercel.json`) needs a Vercel plan whose cron jobs actually run hourly — the
  Hobby tier historically limits cron execution frequency. Check your plan before relying on the
  24-hour auto-refund and overtake-email timing; if it's restricted, either upgrade or point an
  external scheduler (e.g. cron-job.org) at `/api/cron/tick` with the `CRON_SECRET` bearer token
  instead of using `vercel.json`'s cron.
- **Set a Vercel spending limit before the domain goes live** — I cannot do this from here; it
  requires your Vercel account. Project Settings → Billing → Spend Management.
- Put Cloudflare in front of the domain (free tier, proxying on, orange-clouded).

### 7. Legal notice
`/legal` is a placeholder — I did not invent a business identity for it. Fill in the real
registered name, address, and tax/company number of whoever operates the service before taking
payments; this is required in the EU for a paid online service.

## What I could not do from here

I have no accounts on Vercel, Stripe, Supabase, Resend, or Cloudflare, and no access to
`klym.xyz`'s DNS — so nothing above is actually deployed yet. Everything is written, typechecked
(`npx tsc --noEmit`), linted (`npx next lint`), and builds cleanly (`npm run build`); what's left
is entirely the setup steps above, which need your own credentials.

Punch list:
- [ ] Run both SQL files in Supabase
- [ ] Set all env vars in Vercel (including the two added ones above)
- [ ] Create the Stripe webhook and point it here
- [ ] Verify a sending domain in Resend
- [ ] Deploy to Vercel, connect klym.xyz
- [ ] Confirm the cron actually fires hourly on your plan (or use an external scheduler)
- [ ] **Set a Vercel spending limit** — not done, needs your account
- [ ] Put Cloudflare in front (free tier, proxying on)
- [ ] Fill in the real legal-notice details on `/legal`
- [ ] Test with a Stripe test card end-to-end, then one real €5 payment

## A note on the repo root

`index.html` at the repo root (a football tactics board) predates this project and is unrelated —
Next.js doesn't serve it, so it's harmless, but I left it untouched rather than deleting something
I didn't create. Remove it if you don't need it.

## Known limits (by design, not bugs)

- **Residential proxies** can't be distinguished from real visitors by any header or heuristic.
  The 70% cap limits the damage; `visit_velocity` (in `db/schema.sql`) makes bought traffic
  visible because it arrives flat and fast rather than in a curve.
- **Approval isn't fully automated.** The filter clears the obvious cases; a human still looks at
  the rest, from `/admin/board` on a phone.
