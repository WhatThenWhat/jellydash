import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '../core/crypto.ts';

/** Bearer-token check for the service-to-service API used by the Wizarr fork. Returns a response on failure. */
export function requireInternal(request: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ message: 'Internal API is not configured' }, { status: 503 });
  }
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(token, expected)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  return null;
}
