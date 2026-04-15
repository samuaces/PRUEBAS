import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { siteId, url, referrer, screenWidth, language } = body

    // Respect Do Not Track
    if (request.headers.get('dnt') === '1') {
      return NextResponse.json({ ok: true })
    }

    // Get IP and anonymize (only country via CF header or similar)
    const country =
      request.headers.get('cf-ipcountry') ||
      request.headers.get('x-vercel-ip-country') ||
      'Unknown'

    // Detect device type from user agent
    const ua = request.headers.get('user-agent') || ''
    let device = 'desktop'
    if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
      device = /iPad/i.test(ua) ? 'tablet' : 'mobile'
    }

    // Detect browser
    let browser = 'Other'
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome'
    else if (/Firefox/i.test(ua)) browser = 'Firefox'
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
    else if (/Edg/i.test(ua)) browser = 'Edge'

    // Insert pageview (fire and forget for speed)
    supabaseAdmin
      .from('pageviews')
      .insert({
        site_id: siteId,
        url: url?.substring(0, 2000),
        referrer: referrer?.substring(0, 2000),
        country,
        device,
        browser,
        created_at: new Date().toISOString(),
      })
      .then(() => {})

    return NextResponse.json(
      { ok: true },
      {
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    )
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  )
}
