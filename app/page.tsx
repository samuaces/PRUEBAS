'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    // In production this would create a Supabase account
    setTimeout(() => {
      router.push('/dashboard')
    }, 500)
  }

  return (
    <>
      {/* NAV */}
      <nav className="landing-nav">
        <a href="/" className="landing-logo">
          <span className="logo-mark">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 12 L5 7 L8 9 L11 4 L14 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          ClearMetrics
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <a href="#pricing">Pricing</a>
          <a href="/docs">Docs</a>
        </div>
        <div className="nav-cta">
          <a href="/login" className="btn-ghost">Log in</a>
          <a href="#signup" className="btn-primary">Start free →</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-badge">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          100% Privacy-First · No cookies · GDPR compliant
        </div>
        <h1>
          Analytics that respect<br />
          <span className="highlight">your visitors</span>
        </h1>
        <p className="hero-sub">
          ClearMetrics gives you the insights you need without collecting personal data.
          Beautiful dashboards, AI-powered recommendations, under a 1KB script.
        </p>
        <div className="hero-actions">
          <a href="#signup" className="btn-primary btn-large">
            Start for free →
          </a>
          <a href="/dashboard" className="btn-outline btn-large">
            View demo
          </a>
        </div>
        <p className="hero-note">No credit card required · Free up to 10k pageviews/month</p>
      </section>

      {/* DASHBOARD PREVIEW */}
      <div className="dashboard-preview">
        <div className="preview-frame">
          <div className="preview-bar">
            <span className="preview-dot" style={{background: '#ff5f57'}}></span>
            <span className="preview-dot" style={{background: '#febc2e'}}></span>
            <span className="preview-dot" style={{background: '#28c840'}}></span>
            <div className="preview-url">clearmetrics.io/dashboard</div>
          </div>
          <div className="preview-inner">
            <div className="preview-stats">
              {[
                { label: 'Unique Visitors', value: '24,891', trend: '+18%' },
                { label: 'Pageviews', value: '87,342', trend: '+24%' },
                { label: 'Bounce Rate', value: '41.2%', trend: '-3.1%' },
                { label: 'Avg Duration', value: '2m 38s', trend: '+12s' },
              ].map((stat) => (
                <div key={stat.label} className="preview-stat">
                  <div className="preview-stat-label">{stat.label}</div>
                  <div className="preview-stat-value">{stat.value}</div>
                  <div className="preview-stat-trend">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 7 L5 3 L8 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {stat.trend}
                  </div>
                </div>
              ))}
            </div>
            <div className="preview-chart">
              <svg className="chart-line" viewBox="0 0 400 80" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a472a" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="#1a472a" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path
                  d="M0 60 L40 50 L80 45 L120 35 L160 40 L200 25 L240 20 L280 30 L320 15 L360 10 L400 5 L400 80 L0 80 Z"
                  fill="url(#chartGrad)"
                />
                <path
                  d="M0 60 L40 50 L80 45 L120 35 L160 40 L200 25 L240 20 L280 30 L320 15 L360 10 L400 5"
                  fill="none"
                  stroke="#1a472a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="features-section" id="features">
        <div className="section-label">Features</div>
        <h2 className="section-title">Everything you need.<br />Nothing you don't.</h2>
        <p className="section-sub">
          Built for indie makers, startups, and privacy-conscious teams who want real insights without the bloat.
        </p>
        <div className="features-grid">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10 L7 14 L17 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'Cookieless Tracking',
              desc: 'No cookies, no fingerprinting. We use a privacy-preserving method that is fully GDPR, CCPA, and PECR compliant out of the box.'
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'AI-Powered Insights',
              desc: 'Get plain-English recommendations powered by Claude AI. Know exactly what to fix, what to double down on, and why your metrics are changing.'
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6 10 L8 12 L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'Under 1KB Script',
              desc: 'Our tracking script is tiny — under 1KB minified. It loads instantly and won\'t slow down your site by even a millisecond.'
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              title: 'Real-Time Dashboard',
              desc: 'See who is on your site right now. Live visitor count, active pages, and event streams updated every few seconds.'
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 14 L4 10 M8 14 L8 6 M12 14 L12 8 M16 14 L16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              title: 'Goal Tracking',
              desc: 'Define conversion goals by URL pattern or custom events. Track signups, purchases, downloads, and any action that matters to your business.'
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6h16M6 2v4M14 2v4M4 10h3M4 14h5M13 10l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'Email Reports',
              desc: 'Weekly and monthly digest emails with the key numbers. Share reports with your team or clients with a single public link.'
            },
          ].map((feature) => (
            <div key={feature.title} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <div className="feature-title">{feature.title}</div>
              <div className="feature-desc">{feature.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRIVACY SECTION */}
      <section className="privacy-section" id="privacy">
        <div className="privacy-inner">
          <div>
            <div className="section-label">Privacy-first</div>
            <h2 className="section-title">We collect less.<br />You learn more.</h2>
            <p className="section-sub">
              Traditional analytics track everything about your visitors — their identity, behavior, and browsing history.
              We take a different approach.
            </p>
            <div className="privacy-checks">
              {[
                { title: 'No personal data collected', desc: 'We never store IP addresses, device IDs, or any personally identifiable information.' },
                { title: 'No cross-site tracking', desc: 'Your visitors are not tracked across other websites. Their data stays on your site.' },
                { title: 'Do Not Track respected', desc: 'We honor browser-level DNT settings, unlike most analytics providers.' },
                { title: 'Data stored in EU', desc: 'All data is stored on EU servers, making GDPR compliance trivial for your DPA.' },
              ].map((check) => (
                <div key={check.title} className="privacy-check">
                  <div className="check-icon">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6 L5 9 L10 3" stroke="#1a472a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p><strong>{check.title}</strong> — {check.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="privacy-visual">
            <div className="pv-title">Data we collect per pageview</div>
            {[
              { label: 'IP Address', value: 'Never stored', badge: true },
              { label: 'Page URL', value: 'Path only' },
              { label: 'Referrer', value: 'Domain only' },
              { label: 'Country', value: 'From IP (then discarded)' },
              { label: 'Browser', value: 'From User-Agent' },
              { label: 'Device type', value: 'Desktop / Mobile / Tablet' },
              { label: 'Cookies set', value: 'None', badge: true },
              { label: 'Fingerprinting', value: 'None', badge: true },
            ].map((row) => (
              <div key={row.label} className="pv-row">
                <span className="pv-label">{row.label}</span>
                {row.badge ? (
                  <span className="pv-badge">{row.value}</span>
                ) : (
                  <span className="pv-value">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing-section" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-title">Simple, transparent pricing</h2>
        <p className="section-sub" style={{margin: '0 auto 0', maxWidth: '400px'}}>
          No per-seat fees. No hidden costs. Cancel anytime.
        </p>
        <div className="pricing-grid">
          {[
            {
              name: 'Hobby',
              desc: 'For personal projects and side hustles',
              price: '$0',
              period: '/mo',
              popular: false,
              features: ['Up to 10k pageviews/mo', '1 website', '30-day data retention', 'Core analytics', 'Email support'],
              cta: 'Start free',
              ctaClass: 'btn-plan-outline',
            },
            {
              name: 'Starter',
              desc: 'For growing websites and small teams',
              price: '$9',
              period: '/mo',
              popular: true,
              features: ['Up to 100k pageviews/mo', '5 websites', '12-month data retention', 'AI insights (50/mo)', 'Goal tracking', 'Email reports', 'Priority support'],
              cta: 'Start free trial',
              ctaClass: 'btn-plan-filled',
            },
            {
              name: 'Growth',
              desc: 'For high-traffic sites and agencies',
              price: '$29',
              period: '/mo',
              popular: false,
              features: ['Up to 1M pageviews/mo', 'Unlimited websites', 'Unlimited data retention', 'AI insights (unlimited)', 'Custom goals', 'Public dashboards', 'API access', 'Team members'],
              cta: 'Start free trial',
              ctaClass: 'btn-plan-outline',
            },
          ].map((plan) => (
            <div key={plan.name} className={`pricing-card${plan.popular ? ' popular' : ''}`}>
              {plan.popular && <div className="popular-badge">Most popular</div>}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-desc">{plan.desc}</div>
              <div className="plan-price">
                <span className="amount">{plan.price}</span>
                <span className="period">{plan.period}</span>
              </div>
              <ul className="plan-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7 L5.5 10 L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="#signup" className={`btn-plan ${plan.ctaClass}`}>{plan.cta}</a>
            </div>
          ))}
        </div>
      </section>

      {/* SIGNUP */}
      <section className="signup-section" id="signup">
        <div className="signup-inner">
          <div className="section-label">Get started today</div>
          <h2 className="section-title">Start measuring what matters</h2>
          <p className="section-sub" style={{margin: '0 auto'}}>
            Join thousands of developers and founders who have switched to privacy-first analytics.
          </p>
          <form className="signup-form" onSubmit={handleSignup}>
            <input
              type="email"
              className="signup-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary btn-large" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Get started free →'}
            </button>
          </form>
          <p className="signup-note">No credit card required. Free up to 10,000 pageviews/month.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <a href="/" className="landing-logo">
            <span className="logo-mark">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 12 L5 7 L8 9 L11 4 L14 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            ClearMetrics
          </a>
          <div className="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms</a>
            <a href="/docs">Docs</a>
            <a href="https://github.com/clearmetrics" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div className="footer-copy">© 2025 ClearMetrics. All rights reserved.</div>
        </div>
      </footer>
    </>
  )
}
