import { NextRequest, NextResponse } from 'next/server';
import { getEventTokenCookieHeader, isEventTokenRequired } from '../../utils/eventToken';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim() ?? '';

  if (isEventTokenRequired()) {
    const expectedToken = process.env.EVENT_TOKEN?.trim() ?? '';
    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized access', details: 'Invalid or missing event token.' },
        { status: 401 }
      );
    }
  }

  const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
  const cookieHeader = getEventTokenCookieHeader();
  if (cookieHeader) {
    response.headers.set('Set-Cookie', cookieHeader);
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
