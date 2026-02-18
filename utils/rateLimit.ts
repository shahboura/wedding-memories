import { getEventTokenForRateLimit } from './eventToken';

/**
 * Professional in-memory rate limiter implementation
 * Thread-safe, memory-efficient, and production-ready for serverless environments
 */

/**
 * Rate limit window configuration
 */
interface RateLimitWindow {
  requests: number[];
  lastCleanup: number;
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  identifier: string;
}

/**
 * Rate limit result
 */
interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfterSeconds?: number;
}

/**
 * Thread-safe in-memory storage for rate limiting
 * Uses Map for O(1) lookups and automatic cleanup
 */
class RateLimitStore {
  private store = new Map<string, RateLimitWindow>();
  private lastGlobalCleanup = Date.now();
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private readonly MAX_ENTRIES = 10000; // Prevent memory leaks

  /**
   * Gets or creates a rate limit window for a key
   */
  getWindow(key: string): RateLimitWindow {
    let window = this.store.get(key);
    if (!window) {
      window = {
        requests: [],
        lastCleanup: Date.now(),
      };
      this.store.set(key, window);
    }
    return window;
  }

  /**
   * Performs periodic cleanup to prevent memory leaks
   */
  performMaintenance(): void {
    const now = Date.now();

    // Global cleanup every minute
    if (now - this.lastGlobalCleanup > this.CLEANUP_INTERVAL) {
      this.cleanup(now);
      this.lastGlobalCleanup = now;
    }
  }

  /**
   * Removes expired entries and limits store size
   */
  private cleanup(now: number): void {
    // Remove entries that haven't been used in 15 minutes
    const expireTime = now - 15 * 60 * 1000;

    const entries = Array.from(this.store.entries());
    for (const [key, window] of entries) {
      if (window.lastCleanup < expireTime) {
        this.store.delete(key);
      }
    }

    // If still too many entries, remove oldest ones (LRU-style)
    if (this.store.size > this.MAX_ENTRIES) {
      const allEntries = Array.from(this.store.entries());
      allEntries.sort(([, a], [, b]) => a.lastCleanup - b.lastCleanup);

      const toRemove = allEntries.slice(0, this.store.size - this.MAX_ENTRIES);
      toRemove.forEach(([key]) => this.store.delete(key));
    }
  }

  /**
   * Gets store size for monitoring
   */
  getSize(): number {
    return this.store.size;
  }
}

// Global store instance (singleton pattern)
const rateLimitStore = new RateLimitStore();

/**
 * Sliding window rate limiter implementation
 * More accurate than fixed window, prevents burst at window boundaries
 */
class SlidingWindowRateLimit {
  constructor(private config: RateLimitConfig) {}

  /**
   * Checks if request is within rate limits
   */
  check(identifier: string): RateLimitResult {
    rateLimitStore.performMaintenance();

    const key = `${this.config.identifier}:${identifier}`;
    const window = rateLimitStore.getWindow(key);
    const now = Date.now();

    // Update cleanup timestamp
    window.lastCleanup = now;

    // Remove requests outside the window
    const windowStart = now - this.config.windowMs;
    window.requests = window.requests.filter((timestamp) => timestamp > windowStart);

    // Check if limit would be exceeded
    if (window.requests.length >= this.config.maxRequests) {
      const oldestRequest = Math.min(...window.requests);
      const retryAfterMs = this.config.windowMs - (now - oldestRequest);

      return {
        success: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetTime: oldestRequest + this.config.windowMs,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    // Add current request
    window.requests.push(now);

    return {
      success: true,
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests - window.requests.length,
      resetTime: now + this.config.windowMs,
    };
  }
}

/**
 * Wedding-optimized rate limiters
 *
 * A single sustained limiter is sufficient for a wedding app — guests
 * naturally upload in bursts (selecting 10-15 photos at once) and a
 * per-minute burst cap would only frustrate legitimate users.
 */
const uploadRateLimit = new SlidingWindowRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 60, // 60 uploads per 5 minutes
  identifier: 'upload',
});

const photosRateLimit = new SlidingWindowRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute per client
  identifier: 'photos',
});

/**
 * Extracts client identifier from request
 * Uses multiple fallbacks for reliable identification
 */
function getClientIdentifier(request: Request): string {
  // Try various IP headers (Vercel, Cloudflare, etc.)
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // Handle comma-separated IPs (x-forwarded-for)
      const ip = value.split(',')[0]?.trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  // Ultimate fallback
  return 'unknown';
}

function getRateLimitIdentifier(request: Request): string {
  const ipIdentifier = getClientIdentifier(request);
  const eventToken = getEventTokenForRateLimit(request);

  if (eventToken) {
    return `${eventToken}:${ipIdentifier}`;
  }

  return ipIdentifier;
}

function normalizeGuestName(guestName: string): string {
  return guestName.trim().toLowerCase();
}

function getUploadRateLimitIdentifier(request: Request, guestName: string): string {
  const baseIdentifier = getRateLimitIdentifier(request);
  const normalizedGuest = normalizeGuestName(guestName);
  return `${baseIdentifier}:guest=${normalizedGuest}`;
}

/**
 * Photos API rate limiting
 * Prevents scraping/abuse of the gallery listing endpoint
 */
export function checkPhotosRateLimit(request: Request): RateLimitResult {
  const identifier = getRateLimitIdentifier(request);
  return photosRateLimit.check(identifier);
}

/**
 * Enhanced upload rate limiting
 * Prevents sustained abuse while being generous for normal wedding use
 */
export function checkUploadRateLimit(
  request: Request,
  guestName: string
): RateLimitResult & {
  message?: string;
} {
  const identifier = getUploadRateLimitIdentifier(request, guestName);

  const result = uploadRateLimit.check(identifier);
  if (!result.success) {
    return {
      ...result,
      message:
        "You've shared many beautiful photos! Please wait a few minutes before uploading more.",
    };
  }

  return result;
}

/**
 * Creates standard rate limit response headers
 * Following industry conventions
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };

  if (result.retryAfterSeconds) {
    headers['Retry-After'] = result.retryAfterSeconds.toString();
  }

  return headers;
}
