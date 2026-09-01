# Deploy runbook — klym.xyz

Written for a Claude Code session running **locally**, on the machine of whoever owns the
Supabase/Stripe/Resend/Vercel/Cloudflare accounts and the klym.xyz domain. Read `CLAUDE.md`
first for project context if you haven't already.

**Read this whole file before running anything.** Work top to bottom — later steps depend on
values (URLs, keys, secrets) produced by earlier ones. Every step is either something you should
just run, or explicitly marked **🔴 HUMAN REQUIRED** — a point where only the account owner can
act (a one-time login, a dashboard-only setting, a registrar change, their real legal identity).
There is no way to get a live, paid, legally-compliant service to €0 human touches — the honest
goal here is to shrink those touches to the handful that are genuinely unavoidable, and automate
everything else via each service's CLI or API rather than asking the human to click through
dashboards.

Keep a scratch file (e.g. `.env.production.local`, already gitignored) to accumulate the real
values as you go — you'll push them all into Vercel in one step later.

---

## 0. Tools

Install whatever's missing:

```bash
npm install -g vercel supabase
# Stripe CLI: https://docs.stripe.com/stripe-cli — e.g. `brew install stripe/stripe-cli/stripe`
#   or download the binary for your OS if brew isn't available.
which psql || echo "install postgresql-client (apt/brew) — used to run the two SQL files"
```

---

## 1. Supabase

**🔴 HUMAN REQUIRED (once): `supabase login`** — opens a browser for OAuth. Do this yourself,
then hand control back.

Then, autonomously:

```bash
supabase orgs list                    # note the org id
supabase projects create klym \
  --org-id <ORG_ID> \
  --db-password "$(openssl rand -base64 24)" \
  --region <closest-region>           # e.g. eu-central-1
supabase projects list                # note the new project's ref
supabase link --project-ref <REF>
```

Run the schema — `db/schema.sql` first, then `db/002_extend.sql` (order matters, the second
depends on the first):

```bash
supabase db execute --linked --file db/schema.sql
supabase db execute --linked --file db/002_extend.sql
# if `db execute` isn't available in your CLI version, fall back to psql with the
# connection string from `supabase projects api-keys --project-ref <REF>` / the dashboard:
#   psql "$DATABASE_URL" -f db/schema.sql
#   psql "$DATABASE_URL" -f db/002_extend.sql
```

Get the two values the app needs:

```bash
supabase projects api-keys --project-ref <REF>
# → Project URL          →  SUPABASE_URL
# → service_role secret  →  SUPABASE_SERVICE_ROLE_KEY  (NOT anon — the service role key)
```

---

## 2. Generated secrets

No account needed, just run these and save the output:

```bash
openssl rand -hex 32   # → VISITOR_SALT
openssl rand -hex 32   # → ENTRY_TOKEN_SECRET
openssl rand -hex 32   # → CRON_SECRET
```

**🔴 HUMAN REQUIRED: `ADMIN_PASSWORD`.** This is typed on a phone, daily, by whoever approves
entries — ask the human to choose it (or offer to generate one and hand it to them once; don't
pick a value silently and keep it only in your own output).

---

## 3. Stripe

**🔴 HUMAN REQUIRED (once): `stripe login`** — opens a browser for OAuth.

**🔴 HUMAN REQUIRED: `STRIPE_SECRET_KEY`.** Stripe doesn't hand out the account's live secret key
through the CLI (by design — it's the one credential that can move money). Ask the human to copy
it from the Dashboard: Developers → API keys → Secret key. Use a **test** key first and switch to
live only after the end-to-end test in step 8 passes.

The webhook itself you *can* create from the CLI once you know the deploy URL (do this **after**
step 5's first deploy, once you have the real klym.xyz or *.vercel.app URL):

```bash
stripe webhook_endpoints create \
  --url https://klym.xyz/api/stripe/webhook \
  --enabled-events checkout.session.completed
# → the response includes the signing secret → STRIPE_WEBHOOK_SECRET
```

For local/staging testing before that, use `stripe listen --forward-to localhost:3000/api/stripe/webhook`, which prints a temporary webhook secret for local use.

---

## 4. Resend

**🔴 HUMAN REQUIRED: create the Resend account and an API key** (Dashboard → API Keys) →
`RESEND_API_KEY`. First-account creation and email verification can't be scripted.

Once you have the key, adding and verifying the sending domain is API-drivable:

```bash
curl -s -X POST https://api.resend.com/domains \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"klym.xyz"}'
# → returns the SPF/DKIM/DMARC DNS records Resend needs. Save this response —
#   you'll add these as DNS records in Cloudflare in step 6.
```

---

## 5. Vercel

**🔴 HUMAN REQUIRED (once): `vercel login`.**

```bash
vercel link                 # creates/links the Vercel project to this repo
```

Push every env var (loop over your scratch file, or add one by one):

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add VISITOR_SALT production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add ADMIN_PASSWORD production
vercel env add SAFE_BROWSING_API_KEY production      # see step 7, can be added later
vercel env add OPENAI_API_KEY production               # optional, see README
vercel env add RESEND_API_KEY production
vercel env add EMAIL_FROM production
vercel env add ENTRY_TOKEN_SECRET production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_SITE_URL production          # https://klym.xyz
```

Deploy and attach the domain:

```bash
vercel --prod
vercel domains add klym.xyz
vercel domains inspect klym.xyz    # → the A/CNAME record Vercel needs; add it in Cloudflare, step 6
```

Now go back and finish step 3's webhook creation with the real URL, and `vercel env add
STRIPE_WEBHOOK_SECRET production` with the value it returns, then `vercel --prod` again.

**🔴 HUMAN REQUIRED: Vercel spending limit.** Not exposed via CLI or API — Project Settings →
Billing → Spend Management, in the dashboard. **Do this before the domain goes live** (brief
non-negotiable #5 — a traffic spike or DDoS on a site like this can produce a four-figure bill
overnight).

**🔴 HUMAN REQUIRED: confirm cron frequency.** `vercel.json` asks for an hourly cron
(`/api/cron/tick`). Vercel's Hobby tier has historically limited how often cron jobs actually
fire — check the current plan's limits before relying on the 24h auto-refund and overtake-email
timing. If it's restricted, either upgrade the plan or point an external scheduler (e.g.
cron-job.org, itself scriptable via its API) at `/api/cron/tick` with `Authorization: Bearer
$CRON_SECRET` instead.

---

## 6. Cloudflare

**🔴 HUMAN REQUIRED: create the site in Cloudflare** (free plan) for klym.xyz. This step hands
back two nameservers.

**🔴 HUMAN REQUIRED: change nameservers at the domain registrar** to the two Cloudflare gave you.
This has to happen wherever klym.xyz was purchased — ask the human which registrar that is; if it
turns out to have its own API (several do), it may be possible to automate this specific step too,
worth investigating once you know which registrar.

Once the zone is active (`🔴 HUMAN REQUIRED`, one more click: My Profile → API Tokens → create a
token scoped to "Edit zone DNS" for the klym.xyz zone — hand the token to the session), the DNS
records themselves are scriptable:

```bash
ZONE_ID=<from the Cloudflare dashboard, Overview page>
CF_TOKEN=<the scoped API token above>

# A/CNAME record pointing the root at Vercel (value from `vercel domains inspect klym.xyz`)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"A","name":"klym.xyz","content":"<vercel-ip>","proxied":true}'

# Repeat for each Resend verification record from step 4 (proxied:false for TXT/CNAME email records)
```

Confirm proxying (the orange cloud) is on for the site per brief non-negotiable #6.

---

## 7. Automatic link filter keys

**🔴 HUMAN REQUIRED: `SAFE_BROWSING_API_KEY`.** Google Cloud Console → enable the "Safe Browsing
API" on a project → Credentials → create an API key. Needs a Google Cloud account; if the human
already has `gcloud` configured, this may be scriptable via `gcloud services enable
safebrowsing.googleapis.com` + `gcloud alpha services api-keys create` — worth trying, falling
back to the dashboard if not. The filter fails open (skips this one check, logs it, doesn't block
launch) if this key is never set — not a hard blocker, just weaker phishing detection.

`OPENAI_API_KEY` (moderation check) is genuinely optional — see `README.md`.

---

## 8. Test, then go live

```bash
# with STRIPE_SECRET_KEY still on a test key:
# submit an entry through /submit using Stripe's test card 4242 4242 4242 4242
# confirm: entry lands in Supabase with approved=false, filter ran, receipt email arrived
# approve it from /admin/board on a phone-sized viewport, confirm it appears on the board
# reject a second test entry, confirm the refund fires
```

Once that whole path works: swap `STRIPE_SECRET_KEY` for the **live** key (`vercel env rm` +
`vercel env add` + `vercel --prod`), and do **one real €5 payment** end to end.

---

## 9. Legal notice

**🔴 HUMAN REQUIRED: fill in `/legal`** (`app/legal/page.tsx`) with the operator's real registered
name, address, and tax/company number. This cannot be invented on the operator's behalf — it's
required in the EU for a paid online service, and it has to be true.

---

## When you're done

Report back: the live URL, which steps above got automated vs. which the human had to click
through, confirmation the Vercel spending limit is set, and confirmation of the one real €5
payment (brief's §8 deliverables).
