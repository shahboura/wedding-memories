import { NextRequest, NextResponse } from 'next/server';
import { EVENT_TOKEN_COOKIE, isEventTokenRequired } from './utils/eventToken';

const PUBLIC_PATHS = ['/event', '/event/access', '/_next', '/favicon.ico'];

export function proxy(request: NextRequest): NextResponse {
  if (!isEventTokenRequired()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(EVENT_TOKEN_COOKIE)?.value?.trim() ?? '';
  const expectedToken = process.env.EVENT_TOKEN?.trim() ?? '';
  if (!token || !expectedToken || token !== expectedToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/event/access';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api).*)'],
};
