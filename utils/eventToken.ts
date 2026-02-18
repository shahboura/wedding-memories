const EVENT_TOKEN_ENV = process.env.EVENT_TOKEN?.trim() ?? '';

export const EVENT_TOKEN_HEADER = 'x-event-token';
export const EVENT_TOKEN_COOKIE = 'event_token';

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    const value = rawValue.join('=');
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

export function getEventTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get(EVENT_TOKEN_HEADER)?.trim();
  if (headerToken) return headerToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const cookieToken = cookies[EVENT_TOKEN_COOKIE];
    if (cookieToken) return cookieToken;
  }

  return null;
}

export function isEventTokenRequired(): boolean {
  return EVENT_TOKEN_ENV.length > 0;
}

export function isEventTokenValid(request: Request): boolean {
  if (!isEventTokenRequired()) return true;
  const providedToken = getEventTokenFromRequest(request);
  return !!providedToken && providedToken === EVENT_TOKEN_ENV;
}

export function getEventTokenForRateLimit(request: Request): string | null {
  return getEventTokenFromRequest(request);
}
