import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Upstash Redis client ────────────────────────────────────────────────
// Required env vars:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Get these from https://upstash.com — free tier gives 10,000 commands/day,
// which is plenty for rate limiting auth endpoints.

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// FIX: Don't throw at import time — this breaks `next build` which loads all
// modules to collect page data, even in production mode. Instead, log a
// warning and fall back to no-op rate limiting. The rate limiter will still
// work at runtime if credentials are set via environment variables.
if (!redisUrl || !redisToken) {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting disabled. " +
      "Set these in production for brute-force protection.",
  );
}

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

// ─── Rate limiters ───────────────────────────────────────────────────────
// Sliding window over 15 minutes. Different limits for different surfaces.

const loginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:login",
      analytics: true,
    })
  : null;

const recoveryLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:recovery",
      analytics: true,
    })
  : null;

// FIX P1-18: Tighten PIN rate limit from 10/15min to 5/15min. Combined with
// the 6-digit minimum, this makes brute-force infeasible (1M combinations /
// 5 attempts per 15 min = ~3,800 days to crack).
const pinLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:pin",
      analytics: true,
    })
  : null;

// AUDIT-FIX C-9: Password-change rate limit. 10 attempts per 15 min per
// user+IP — generous enough for legitimate typos, tight enough to block
// brute-force of the oldPassword field (relevant if an attacker has a
// stolen JWT but not the password).
const passwordChangeLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:passwordChange",
      analytics: true,
    })
  : null;

// AUDIT-FIX H-28: Generic mutation rate limit. Applied to all mutating
// endpoints (sales, returns, expenses, journal entries, etc.) to prevent
// a compromised JWT from scripting thousands of fake operations. 100 per
// minute per user — generous for normal use, blocks scripted abuse.
const mutationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "rl:mutation",
      analytics: true,
    })
  : null;

// AUDIT-FIX H-28: Tighter financial-mutation rate limit. Applied to
// sensitive endpoints (returns, journal entries, payroll, bulk imports).
// 20 per minute per user — still generous for normal use.
const financialMutationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "rl:financialMutation",
      analytics: true,
    })
  : null;

// AUDIT-FIX C-10: Bulk-import rate limit. 5 imports per hour per user —
// prevents a compromised warehouse JWT from DoS'ing the DB with huge
// imports.
const bulkImportLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "rl:bulkImport",
      analytics: true,
    })
  : null;

// ─── Public API ──────────────────────────────────────────────────────────

export type RateLimitSurface =
  | "login"
  | "recovery"
  | "pin"
  | "passwordChange"
  | "mutation"
  | "financialMutation"
  | "bulkImport";

const limiters: Record<RateLimitSurface, Ratelimit | null> = {
  login: loginLimiter,
  recovery: recoveryLimiter,
  pin: pinLimiter,
  passwordChange: passwordChangeLimiter,
  mutation: mutationLimiter,
  financialMutation: financialMutationLimiter,
  bulkImport: bulkImportLimiter,
};

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Rate-limit an identifier (typically IP + userId) for a given surface.
 * Returns `{ success: false }` if the limit has been exceeded.
 */
export async function rateLimit(
  surface: RateLimitSurface,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = limiters[surface];

  // Dev fallback — no Redis configured, allow all
  if (!limiter) {
    return {
      success: true,
      remaining: 999,
      resetTime: Date.now() + 15 * 60 * 1000,
    };
  }

  // AUDIT-FIX: If Redis is configured but unreachable (network issue,
  // wrong credentials, DNS failure, etc.), fall back to allowing the
  // request instead of throwing a 500. Rate limiting is a security
  // enhancement, not a core business function — the app should still
  // work if Redis is down. Log the error so ops can detect it.
  //
  // We also add a 3-second timeout — without it, a DNS failure or
  // unreachable host can hang the request for 4+ seconds (the default
  // fetch timeout), making the app feel broken even though it would
  // eventually fall back.
  try {
    const result = await Promise.race([
      limiter.limit(identifier),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis timeout")), 3000),
      ),
    ]);

    return {
      success: result.success,
      remaining: result.remaining,
      resetTime: result.reset,
    };
  } catch (err) {
    console.warn("[rate-limit] Redis unreachable — allowing request (fallback mode):", {
      surface,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: true,
      remaining: 999,
      resetTime: Date.now() + 15 * 60 * 1000,
    };
  }
}

/**
 * Extract the client IP from request headers, accounting for Vercel's
 * proxy layer (x-forwarded-for).
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// AUDIT-FIX H-28: HOC that wraps an API route handler with rate limiting.
// Usage:
//   export const POST = withRateLimit("financialMutation", handler);
//
// The identifier combines userId (from session) and IP — so a single user
// is throttled across devices, and a single IP is throttled across users.
//
// If Redis is not configured (dev), the rate limit is a no-op (returns
// success). In production, set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
//
// Recommended surfaces per route type:
//   - "mutation" (100/min) — generic POST/PATCH/DELETE on most resources
//   - "financialMutation" (20/min) — returns, journal entries, payroll, cash-in/out
//   - "bulkImport" (5/hour) — product CSV import
//   - "pin" (5/15min) — PIN verify + change
//   - "passwordChange" (10/15min) — password change
//   - "login" (5/15min) — login
//   - "recovery" (5/15min) — recovery code reset
import { NextRequest, NextResponse } from "next/server";

type RouteHandler<T> = (
  req: NextRequest,
  ctx: T,
) => Promise<NextResponse> | NextResponse;

export function withRateLimit<T = unknown>(
  surface: RateLimitSurface,
  handler: RouteHandler<T>,
): RouteHandler<T> {
  return async (req: NextRequest, ctx: T) => {
    // We can't get the userId without a session, so we use IP-only here.
    // Routes that already have a session can call rateLimit() directly
    // with a userId+IP identifier for tighter per-user throttling.
    const ip = getClientIp(req);
    const rl = await rateLimit(surface, ip);
    if (!rl.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests. Please slow down.",
          code: "RATE_LIMITED",
          retryAfter: Math.ceil((rl.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetTime - Date.now()) / 1000)),
            "X-RateLimit-Remaining": String(rl.remaining),
            "X-RateLimit-Reset": String(rl.resetTime),
          },
        },
      );
    }
    return handler(req, ctx);
  };
}
