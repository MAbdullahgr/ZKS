import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  statusCode: number;
  details?: Record<string, string[]>; // For Zod field-level errors
}

// INFRA: Optional `headers` param lets callers attach per-response headers
// (most commonly the X-RateLimit-* / Retry-After headers from
// `rateLimit()` so the frontend can show "N attempts left" UX). Headers
// passed here are merged into the NextResponse — they don't overwrite the
// status/body. Keeping this optional preserves backward compatibility with
// the many existing apiSuccess/apiError call sites that don't pass headers.
export type ResponseHeaders = Record<string, string>;

export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200,
  headers?: ResponseHeaders,
) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    { success: true, data, message },
    { status, headers },
  );
}

export function apiError(
  error: string,
  statusCode: number = 500,
  code?: string,
  details?: Record<string, string[]>,
  headers?: ResponseHeaders,
) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error, code, statusCode, details },
    { status: statusCode, headers },
  );
}

// INFRA: Helper that converts a RateLimitResult into the standard
// X-RateLimit-* / Retry-After response headers. Routes that call
// `rateLimit()` directly (login, password change, PIN change, etc.) can use
// this to mirror the headers that `withRateLimit` HOC sets automatically.
export interface RateLimitResultLike {
  success: boolean;
  remaining: number;
  resetTime: number;
}

export function rateLimitHeaders(
  rl: RateLimitResultLike,
): ResponseHeaders {
  const retryAfter = Math.max(0, Math.ceil((rl.resetTime - Date.now()) / 1000));
  return {
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(rl.resetTime),
    // Retry-After is most useful when the limit is hit, but advertising it
    // always lets the frontend show "next attempt allowed in Ns" UX even
    // before the limit is exceeded.
    "Retry-After": String(retryAfter),
  };
}
