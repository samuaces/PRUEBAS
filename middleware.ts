import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isValidSession } from '@/lib/adminAuth';

export const config = {
  matcher: ['/admin/board/:path*', '/api/admin/approve', '/api/admin/reject'],
};

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSession(cookie)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/admin', req.url));
}
