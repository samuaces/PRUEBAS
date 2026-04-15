import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('siteId')
  const period = searchParams.get('period') || '30d'

  if (!siteId)
    return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  // Calculate date range
  const days =
    period === '7d' ? 7 : period === '90d' ? 90 : period === '12m' ? 365 : 30
  const from = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString()
  const prevFrom = new Date(
    Date.now() - 2 * days * 24 * 60 * 60 * 1000
  ).toISOString()

  // Fetch analytics data
  const [current, previous, topPages, topSources] = await Promise.all([
    supabaseAdmin
      .from('pageviews')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .gte('created_at', from),
    supabaseAdmin
      .from('pageviews')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .gte('created_at', prevFrom)
      .lt('created_at', from),
    supabaseAdmin
      .from('pageviews')
      .select('url')
      .eq('site_id', siteId)
      .gte('created_at', from)
      .limit(100),
    supabaseAdmin
      .from('pageviews')
      .select('referrer')
      .eq('site_id', siteId)
      .gte('created_at', from)
      .limit(100),
  ])

  const currentCount = current.count || 0
  const previousCount = previous.count || 1
  const growth = Math.round(
    ((currentCount - previousCount) / previousCount) * 100
  )

  // Count top pages
  const pageCount: Record<string, number> = {}
  topPages.data?.forEach((pv) => {
    try {
      const path = pv.url ? new URL(pv.url).pathname : '/'
      pageCount[path] = (pageCount[path] || 0) + 1
    } catch {
      pageCount['/'] = (pageCount['/'] || 0) + 1
    }
  })
  const topPagesStr = Object.entries(pageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, c]) => `${p}: ${c}`)
    .join(', ')

  const sourceCount: Record<string, number> = {}
  topSources.data?.forEach((pv) => {
    try {
      const src = pv.referrer ? new URL(pv.referrer).hostname : 'Direct'
      sourceCount[src] = (sourceCount[src] || 0) + 1
    } catch {
      sourceCount['Direct'] = (sourceCount['Direct'] || 0) + 1
    }
  })
  const topSourcesStr = Object.entries(sourceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s, c]) => `${s}: ${c}`)
    .join(', ')

  const prompt = `You are an analytics AI for ClearMetrics. Given this website data for the last ${period}, generate 3-4 concise, actionable insights in JSON format.

Data:
- Pageviews: ${currentCount} (${growth > 0 ? '+' : ''}${growth}% vs previous period)
- Top pages: ${topPagesStr || 'No data yet'}
- Top sources: ${topSourcesStr || 'No data yet'}

Return a JSON array of insights, each with: { "type": "positive"|"warning"|"info", "title": "short title", "text": "1-2 sentence insight with specific action" }

Be specific and actionable. If there's not much data, suggest actions to get more traffic.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content =
      message.content[0].type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    const insights = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return NextResponse.json({ insights })
  } catch {
    return NextResponse.json({
      insights: [
        {
          type: 'info',
          title: 'Getting started',
          text: 'Add the tracking script to your website to start collecting analytics data.',
        },
      ],
    })
  }
}
