/**
 * In-memory rate limiter for demo purposes
 * 
 * WARNING: This is a simple in-memory implementation suitable for development/demo only.
 * For production, use Redis-based rate limiting (e.g., Upstash Rate Limit), 
 * a WAF (e.g., Cloudflare), or a dedicated rate limiting service.
 * 
 * Limitations:
 * - State is lost on server restart
 * - Does not work across multiple server instances
 * - Memory usage grows with unique IPs/keys
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    // Periodic cleanup of expired entries to prevent memory leak
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, windowMs);
  }

  /**
   * Check if a key is rate limited
   * @param key - Unique identifier (e.g., IP address)
   * @returns Object with allowed status and retry information
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired entry
    if (!entry || now >= entry.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: now + this.windowMs,
      };
    }

    // Entry exists and is still valid
    if (entry.count < this.maxRequests) {
      entry.count++;
      return {
        allowed: true,
        remaining: this.maxRequests - entry.count,
        resetAt: entry.resetAt,
      };
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  /**
   * Clean up expired entries from the store
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all rate limit data
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Default rate limiter for uploads: 10 requests per minute
export const uploadRateLimiter = new RateLimiter(10, 60000);

/**
 * Extract client IP from request headers
 * Respects x-forwarded-for (first hop) for proxied requests
 * @param headers - Request headers
 * @returns Client IP address
 */
export function getClientIp(headers: Headers): string {
  // Check x-forwarded-for header (standard for proxied requests)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP in the list (client IP)
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  // Fallback headers
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp;

  // Default fallback
  return 'unknown';
}

/**
 * Check rate limit and return appropriate response if exceeded
 * @param identifier - Unique identifier for rate limiting
 * @param limiter - Rate limiter instance to use
 * @returns Response object if rate limited, null if allowed
 */
export function checkRateLimit(
  identifier: string,
  limiter: RateLimiter = uploadRateLimiter
): Response | null {
  const { allowed, retryAfter, resetAt } = limiter.check(identifier);

  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': retryAfter?.toString() || '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toString(),
        },
      }
    );
  }

  return null;
}
