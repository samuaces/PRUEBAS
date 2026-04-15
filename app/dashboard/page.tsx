'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KpiCard {
  label: string
  value: string
  trend: string
  trendUp: boolean
}

interface TableRow {
  label: string
  value: number
  pct: number
}

interface Insight {
  type: 'positive' | 'warning' | 'info'
  title: string
  text: string
}

interface ChartPoint {
  date: string
  visitors: number
  pageviews: number
}

// ─── Sample data ─────────────────────────────────────────────────────────────

function generateChartData(days: number): ChartPoint[] {
  const data: ChartPoint[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000)
    const label =
      days <= 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : days <= 30
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const base = 600 + Math.sin(i * 0.4) * 200
    const noise = Math.random() * 300
    const visitors = Math.round(base + noise)
    data.push({ date: label, visitors, pageviews: Math.round(visitors * 2.8) })
  }
  return data
}

const SAMPLE_SOURCES: TableRow[] = [
  { label: 'Direct', value: 8241, pct: 33 },
  { label: 'google.com', value: 6180, pct: 25 },
  { label: 'twitter.com', value: 3706, pct: 15 },
  { label: 'github.com', value: 2471, pct: 10 },
  { label: 'hn.algolia.com', value: 1977, pct: 8 },
  { label: 'reddit.com', value: 987, pct: 4 },
]

const SAMPLE_PAGES: TableRow[] = [
  { label: '/', value: 14200, pct: 38 },
  { label: '/pricing', value: 6800, pct: 18 },
  { label: '/docs', value: 4200, pct: 11 },
  { label: '/blog/privacy-analytics', value: 3100, pct: 8 },
  { label: '/dashboard', value: 2800, pct: 7 },
  { label: '/blog', value: 2100, pct: 6 },
]

const SAMPLE_COUNTRIES: TableRow[] = [
  { label: 'United States', value: 9800, pct: 40 },
  { label: 'Germany', value: 3920, pct: 16 },
  { label: 'United Kingdom', value: 2940, pct: 12 },
  { label: 'France', value: 1960, pct: 8 },
  { label: 'Canada', value: 1470, pct: 6 },
  { label: 'Netherlands', value: 980, pct: 4 },
]

const SAMPLE_DEVICES: TableRow[] = [
  { label: 'Desktop', value: 17150, pct: 70 },
  { label: 'Mobile', value: 6125, pct: 25 },
  { label: 'Tablet', value: 1225, pct: 5 },
]

const SAMPLE_INSIGHTS: Insight[] = [
  {
    type: 'positive',
    title: 'Traffic is growing',
    text: 'Your visitor count is up 18% compared to last period. The blog post on privacy analytics is a key driver — consider publishing a follow-up.',
  },
  {
    type: 'info',
    title: 'High direct traffic',
    text: '33% of your visitors come directly. This suggests strong brand recall. Double down on email newsletters to keep this momentum.',
  },
  {
    type: 'warning',
    title: 'Mobile bounce rate',
    text: 'Mobile visitors are leaving faster than desktop users. Check your mobile layout — especially the hero section — for usability issues.',
  },
  {
    type: 'positive',
    title: 'Pricing page performance',
    text: 'The /pricing page sees 18% of all traffic. This is a healthy sign. Consider adding social proof or a FAQ to improve conversion.',
  },
]

// ─── Components ──────────────────────────────────────────────────────────────

function KpiCardComp({ card }: { card: KpiCard }) {
  return (
    <div
      style={{
        background: '#faf8f3',
        border: '1px solid #d4cfc3',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#6b6860',
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {card.label}
      </div>
      <div
        style={{
          fontSize: '1.875rem',
          fontWeight: 800,
          color: '#0a0a0f',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {card.value}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: card.trendUp ? '#1a472a' : '#b45309',
        }}
      >
        {card.trendUp ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 9 L6 3 L10 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 3 L6 9 L10 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {card.trend} vs last period
      </div>
    </div>
  )
}

function TableSection({
  title,
  rows,
  valueLabel = 'Visitors',
}: {
  title: string
  rows: TableRow[]
  valueLabel?: string
}) {
  return (
    <div
      style={{
        background: '#faf8f3',
        border: '1px solid #d4cfc3',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid #d4cfc3',
          fontWeight: 700,
          fontSize: '0.875rem',
          color: '#0a0a0f',
        }}
      >
        {title}
      </div>
      <div>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.625rem 1.25rem',
              borderBottom: i < rows.length - 1 ? '1px solid #ede9df' : 'none',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: '0.875rem',
                color: '#0a0a0f',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.label}
            </div>
            <div
              style={{
                width: 80,
                height: 4,
                background: '#ede9df',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${row.pct}%`,
                  height: '100%',
                  background: '#1a472a',
                  borderRadius: 2,
                }}
              />
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#0a0a0f',
                minWidth: 48,
                textAlign: 'right',
              }}
            >
              {row.value.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: '0.8125rem',
                color: '#6b6860',
                minWidth: 36,
                textAlign: 'right',
              }}
            >
              {row.pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    positive: { bg: '#e8f4ea', border: 'rgba(26,71,42,0.2)', icon: '#1a472a' },
    warning: { bg: '#fef3c7', border: 'rgba(180,83,9,0.2)', icon: '#b45309' },
    info: { bg: '#eff6ff', border: 'rgba(37,99,235,0.2)', icon: '#1d4ed8' },
  }
  const c = colors[insight.type]

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '0.875rem',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '0.875rem',
          color: '#0a0a0f',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {insight.type === 'positive' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7 L5.5 10.5 L12 4"
              stroke={c.icon}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {insight.type === 'warning' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2 L12 12 L2 12 Z"
              stroke={c.icon}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <line x1="7" y1="6" x2="7" y2="9" stroke={c.icon} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7" cy="10.5" r="0.75" fill={c.icon} />
          </svg>
        )}
        {insight.type === 'info' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke={c.icon} strokeWidth="1.5" />
            <line x1="7" y1="6" x2="7" y2="10" stroke={c.icon} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="0.75" fill={c.icon} />
          </svg>
        )}
        {insight.title}
      </div>
      <div style={{ fontSize: '0.8125rem', color: '#3d3d3d', lineHeight: 1.5 }}>
        {insight.text}
      </div>
    </div>
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#0a0a0f',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
        fontSize: '0.8125rem',
        color: 'white',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontWeight: 700 }}>
          {p.name}: {p.value.toLocaleString()}
        </div>
      ))}
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '12m'>('30d')
  const [insights, setInsights] = useState<Insight[]>(SAMPLE_INSIGHTS)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [showChart, setShowChart] = useState<'visitors' | 'pageviews'>(
    'visitors'
  )

  const days =
    period === '7d' ? 7 : period === '90d' ? 90 : period === '12m' ? 365 : 30
  const chartData = generateChartData(days)

  const kpis: KpiCard[] = [
    { label: 'Unique Visitors', value: '24,891', trend: '+18%', trendUp: true },
    { label: 'Pageviews', value: '87,342', trend: '+24%', trendUp: true },
    { label: 'Bounce Rate', value: '41.2%', trend: '-3.1%', trendUp: true },
    { label: 'Avg Duration', value: '2m 38s', trend: '+12s', trendUp: true },
  ]

  useEffect(() => {
    // In production, fetch real insights from /api/insights
    // For demo, we use the sample data already set
  }, [period])

  const periodLabels = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    '12m': 'Last 12 months',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f2eb',
        color: '#0a0a0f',
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: 'rgba(245,242,235,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #d4cfc3',
          padding: '0 1.5rem',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
              fontSize: '1rem',
              color: '#0a0a0f',
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                background: '#1a472a',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 12 L5 7 L8 9 L11 4 L14 6"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            ClearMetrics
          </a>
          <div
            style={{
              height: 20,
              width: 1,
              background: '#d4cfc3',
            }}
          />
          {/* Site selector */}
          <select
            style={{
              background: '#faf8f3',
              border: '1px solid #d4cfc3',
              borderRadius: 6,
              padding: '0.3rem 0.75rem',
              fontSize: '0.875rem',
              color: '#0a0a0f',
              cursor: 'pointer',
            }}
          >
            <option>clearmetrics.io</option>
            <option>myapp.example.com</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              background: '#ede9df',
              borderRadius: 8,
              padding: 3,
              gap: 2,
            }}
          >
            {(['7d', '30d', '90d', '12m'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  background: period === p ? '#faf8f3' : 'transparent',
                  color: period === p ? '#0a0a0f' : '#6b6860',
                  boxShadow:
                    period === p ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            style={{
              padding: '0.4rem 0.875rem',
              borderRadius: 6,
              border: '1px solid #d4cfc3',
              background: '#faf8f3',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#0a0a0f',
              cursor: 'pointer',
            }}
          >
            + Add site
          </button>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#1a472a',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            U
          </div>
        </div>
      </header>

      {/* Demo banner */}
      <div
        style={{
          background: '#1a472a',
          color: 'white',
          textAlign: 'center',
          padding: '0.5rem',
          fontSize: '0.8125rem',
        }}
      >
        Demo mode — showing sample data.{' '}
        <a
          href="/"
          style={{ color: '#86efac', textDecoration: 'underline' }}
        >
          Sign up
        </a>{' '}
        to track your real website.
      </div>

      {/* Main content */}
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '1.5rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left column */}
        <div>
          {/* Period label */}
          <div
            style={{
              fontSize: '0.8125rem',
              color: '#6b6860',
              marginBottom: '1rem',
              fontWeight: 500,
            }}
          >
            {periodLabels[period]} · clearmetrics.io
          </div>

          {/* KPI grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}
          >
            {kpis.map((card) => (
              <KpiCardComp key={card.label} card={card} />
            ))}
          </div>

          {/* Chart */}
          <div
            style={{
              background: '#faf8f3',
              border: '1px solid #d4cfc3',
              borderRadius: 12,
              padding: '1.25rem',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: '#0a0a0f',
                }}
              >
                Traffic over time
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['visitors', 'pageviews'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setShowChart(m)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: showChart === m ? '#1a472a' : '#d4cfc3',
                      background: showChart === m ? '#e8f4ea' : 'transparent',
                      color: showChart === m ? '#1a472a' : '#6b6860',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a472a" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#1a472a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#6b6860' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b6860' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey={showChart}
                  stroke="#1a472a"
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#1a472a' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Tables 2-col grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <TableSection title="Top Sources" rows={SAMPLE_SOURCES} />
            <TableSection title="Top Pages" rows={SAMPLE_PAGES} />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
            }}
          >
            <TableSection title="Countries" rows={SAMPLE_COUNTRIES} />
            <TableSection title="Devices" rows={SAMPLE_DEVICES} />
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ position: 'sticky', top: 80 }}>
          {/* AI Insights panel */}
          <div
            style={{
              background: '#faf8f3',
              border: '1px solid #d4cfc3',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid #d4cfc3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  color: '#0a0a0f',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ color: '#1a472a' }}
                >
                  <path
                    d="M7 1L8.5 4.5H12L9.5 6.5L10.5 10L7 8L3.5 10L4.5 6.5L2 4.5H5.5L7 1Z"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                </svg>
                AI Insights
              </div>
              <span
                style={{
                  background: '#e8f4ea',
                  color: '#1a472a',
                  borderRadius: 100,
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Powered by Claude
              </span>
            </div>
            <div style={{ padding: '0.875rem' }}>
              {insights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </div>
          </div>

          {/* Tracking snippet */}
          <div
            style={{
              background: '#faf8f3',
              border: '1px solid #d4cfc3',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid #d4cfc3',
                fontWeight: 700,
                fontSize: '0.875rem',
                color: '#0a0a0f',
              }}
            >
              Tracking Snippet
            </div>
            <div style={{ padding: '0.875rem' }}>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: '#6b6860',
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                Add this to your website's <code style={{background:'#ede9df', padding:'1px 4px', borderRadius:3}}>&lt;head&gt;</code>:
              </p>
              <pre
                style={{
                  background: '#0a0a0f',
                  color: '#86efac',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontSize: '0.7rem',
                  overflow: 'auto',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {`<script
  src="https://clearmetrics.io/tracker.js"
  data-site-id="YOUR_SITE_ID"
  defer
></script>`}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
