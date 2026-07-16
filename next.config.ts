// next.config.ts
import type { NextConfig } from "next";

// FIX P2-10 + INFRA: CSP is now nonce-based for any HTML response that flows
// through src/proxy.ts (middleware). The proxy generates a per-request nonce,
// sets it on the request headers (so Next.js auto-injects `nonce="..."` into
// every inline <script> tag — both the Next.js runtime scripts and any inline
// scripts emitted by server components), and overrides the Content-Security-
// Policy response header with `script-src 'self' 'nonce-<...>' 'strict-dynamic'`.
//
// This STATIC CSP below is only applied to responses that DON'T run through
// the middleware (i.e. paths matched out by `config.matcher` in proxy.ts —
// static assets like .svg/.png/.woff2). For those paths we keep 'unsafe-inline'
// (no scripts are served from there anyway) plus 'strict-dynamic' as a
// defense-in-depth improvement: modern browsers honor 'strict-dynamic' and
// ignore 'unsafe-inline' if a trusted script loader is in play.
//
// To fully migrate to nonce-only CSP (drop 'unsafe-inline' from this fallback
// too), every script tag in the app would need a nonce attribute. Next.js
// FIX: Removed nonce-based CSP + 'strict-dynamic' — it was blocking Next.js
// script bundles from loading (scripts didn't have the nonce attribute).
// Using 'unsafe-inline' for scripts is less strict but works reliably with
// Next.js 16 Turbopack. Can re-add nonce-based CSP later with proper
// Next.js nonce wiring.
const isDev = process.env.NODE_ENV !== "production";

const cspScriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  // Force HTTPS
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer policy
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions policy — lock down sensitive browser features
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(self)",
  },
  // Content Security Policy
  // - default-src 'self': only load from same origin by default
  // - script-src: 'unsafe-eval' ONLY in dev (Turbopack HMR needs it)
  // - style-src 'self' 'unsafe-inline': Tailwind + shadcn need inline styles
  // - img-src 'self' data: https://res.cloudinary.com: Cloudinary + data URIs
  // - font-src 'self' data: local fonts
  // - connect-src 'self' https://res.cloudinary.com: API + Cloudinary
  // - frame-ancestors 'none': prevent embedding (defense-in-depth with X-Frame-Options)
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      cspScriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://res.cloudinary.com blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://res.cloudinary.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Don't expose "X-Powered-By: Next.js" header
  poweredByHeader: false,

  // Cloudinary is our only remote image host
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // Allow specific domains to bypass the auth middleware (already handled in proxy.ts,
  // but this is the Next-level config for which paths run middleware at all)
  // The matcher is defined in src/proxy.ts.
};

export default nextConfig;
