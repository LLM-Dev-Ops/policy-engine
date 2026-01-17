/**
 * Post-Authentication Rate Limiter
 *
 * Rate limiting that applies AFTER authentication.
 * Limits are per-identity, not per-IP.
 */

import { Response, NextFunction } from 'express';
import logger from '@utils/logger';
import { AuthenticatedRequest, AgenticsIdentity } from './agentics-identity';
import { recordRateLimitHit } from './metrics';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Prefix for rate limit keys
}

/**
 * In-memory rate limit store
 * In production, use Redis for distributed rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Get rate limit key for identity
 */
function getRateLimitKey(identity: AgenticsIdentity, prefix: string): string {
  return `${prefix}:${identity.type}:${identity.subject}`;
}

/**
 * Check and update rate limit
 */
function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    // Start new window
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Create post-auth rate limiter middleware
 */
export function createPostAuthRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const fullConfig: RateLimitConfig = {
    windowMs: config.windowMs || 60000,      // 1 minute default
    maxRequests: config.maxRequests || 100,  // 100 requests per minute default
    keyPrefix: config.keyPrefix || 'rl',
  };

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Skip if no identity (shouldn't happen after auth middleware)
    if (!req.identity) {
      next();
      return;
    }

    const key = getRateLimitKey(req.identity, fullConfig.keyPrefix);
    const result = checkRateLimit(key, fullConfig);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', fullConfig.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      logger.warn({
        correlationId: req.correlationId,
        subject: req.identity.subject,
        path: req.path,
        limit: fullConfig.maxRequests,
        windowMs: fullConfig.windowMs,
      }, 'Rate limit exceeded');

      recordRateLimitHit(req.path, req.identity.subject);

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        correlationId: req.correlationId,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Evaluation endpoint rate limiter
 * More restrictive for evaluation to prevent abuse
 */
export const evaluationRateLimiter = createPostAuthRateLimiter({
  windowMs: 60000,       // 1 minute
  maxRequests: 1000,     // 1000 evaluations per minute
  keyPrefix: 'eval',
});

/**
 * Mutation endpoint rate limiter
 * More restrictive for mutations
 */
export const mutationRateLimiter = createPostAuthRateLimiter({
  windowMs: 60000,       // 1 minute
  maxRequests: 50,       // 50 mutations per minute
  keyPrefix: 'mutate',
});

/**
 * Read endpoint rate limiter
 */
export const readRateLimiter = createPostAuthRateLimiter({
  windowMs: 60000,       // 1 minute
  maxRequests: 500,      // 500 reads per minute
  keyPrefix: 'read',
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = createPostAuthRateLimiter({
  windowMs: 3600000,     // 1 hour
  maxRequests: 10,       // 10 per hour
  keyPrefix: 'strict',
});
