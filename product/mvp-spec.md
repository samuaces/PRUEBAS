# EmailPilot MVP

## Product Summary
Chrome extension that generates 3 personalized LinkedIn icebreakers from a public profile URL,
enabling B2B SaaS founders to send high-converting cold outreach in seconds.

## Core Functionality
- Input: Public LinkedIn profile URL (no login required - public data only)
- Processing: Scrape public profile data (name, headline, recent activity, shared posts)
- Output: 3 distinct AI-generated icebreakers tailored to the prospect's context
- Delivery: Displayed in Chrome extension popup, one-click copy to clipboard

## Tech Stack
- Frontend: React + Chrome Extension Manifest v3
- Backend: FastAPI (Python) + Anthropic Claude API
- Database: SQLite (local dev) → PostgreSQL (production)
- Auth: Stripe Customer Portal (email-based, no passwords)
- Hosting: Railway.app (backend) + Chrome Web Store (extension)

## Monetization
| Plan      | Price   | Credits      | Target         |
|-----------|---------|--------------|----------------|
| Free      | $0      | 5 lifetime   | Acquisition    |
| Starter   | $9/mo   | 100/mo       | Prosumers      |
| Pro       | $49/mo  | Unlimited    | Teams/founders |

## First 10 Users Strategy
1. Free trial (5 icebreakers) → demonstrate value
2. In-extension upgrade prompt after credit 3
3. Email drip: day 1 (tips), day 3 (case study), day 7 (upgrade offer)
4. Conversion target: 30% free→paid within 14 days

## Constraints
- NO scraping behind LinkedIn login - public data only via webfetch
- NO storing prospect PII beyond session
- NO false claims - all icebreakers derivable from public profile content
- Stripe keys required for live payments (simulation mode without .env.local)

## Success Metrics (Week 1)
- Installs: 50
- Free trials: 20
- Paid conversions: 3
- MRR target: $147 (3 × $49)

## Generation Date
2026-04-17
