import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/internal/', '/api/health'];

function publicOrigin(): string | null {
  try {
    return new URL(process.env.PUBLIC_BASE_URL ?? '').origin;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isApi && PUBLIC_API_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({ req });

  if (isApi) {
    if (!token) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });
    // CSRF: state-changing requests must come from this app's own origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const expected = publicOrigin();
      const origin = req.headers.get('origin');
      if (!expected || origin !== expected) {
        return NextResponse.json({ message: 'Cross-origin request blocked' }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (token && pathname === '/') return NextResponse.redirect(new URL('/jd-admin', req.url));
  if (!token && pathname.startsWith('/jd-admin')) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/jd-admin/:path*', '/api/:path*']
};
