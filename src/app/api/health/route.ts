import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// INFRA: Liveness/readiness probe for k8s + Vercel. Unauthenticated (so probes
// don't need a JWT) and FAST (all dependency checks run in parallel via
// Promise.allSettled so the slowest one gates the response, not the sum).
//
// Checks:
//   - db:        SELECT 1 — verifies the connection pool can reach the DB
//   - redis:     PING (only if UPSTASH_REDIS_REST_URL is configured). Skipped
//                in dev when Redis isn't set up.
//   - cloudinary: True when CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY +
//                 CLOUDINARY_API_SECRET are all set. We don't actually call
//                 the Cloudinary API here — a config-only check keeps the
//                 probe fast and free of external API budget.
//
// Returns 200 if every CONFIGURED check passes (unconfigured checks are
// treated as "ok" so a fresh dev deploy without Redis still reports healthy).
// Returns 503 if any configured check fails — k8s will restart the pod.

export async function GET() {
  // Each check is wrapped to never throw — Promise.allSettled guarantees we
  // get a result for every check even if one rejects. Each returns a tuple
  // of [name, ok] for the response payload.
  const checks = await Promise.allSettled([
    checkDb(),
    checkRedis(),
    checkCloudinary(),
  ]);

  const [db, redis, cloudinary] = checks.map((r) =>
    r.status === "fulfilled" ? r.value : false,
  );

  // Aggregate ok = every check that wasn't skipped passed.
  const ok = [db, redis, cloudinary].every((v) => v !== false);

  return NextResponse.json(
    { ok, checks: { db, redis, cloudinary } },
    { status: ok ? 200 : 503 },
  );
}

// ─── Individual checks ─────────────────────────────────────────────────────

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error("HEALTH_CHECK_DB_FAILED", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Redis check is conditional — only run if env vars are present. We DON'T
// import the @upstash/redis client here (would pull it into the health
// bundle + risk a module-level throw if env vars are missing). Instead we
// do a raw fetch to the Upstash REST /ping endpoint — same probe, no extra
// deps, no import-time risk.
async function checkRedis(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Not configured — report as "skipped" (null) so ok aggregation still
    // passes for dev deploys. The boolean `true` below mirrors that intent
    // for the simple every() check; null would force a numeric cast.
    return true;
  }
  try {
    // Upstash REST API exposes a /ping endpoint. 5s timeout — if Redis is
    // this slow the probe should fail fast so k8s can restart us.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/ping`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    logger.error("HEALTH_CHECK_REDIS_FAILED", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Cloudinary check is config-only — calling the Cloudinary API on every
// probe would burn API budget and add latency. We verify the env vars are
// present + non-empty; a deeper check (e.g. calling /resources) would catch
// invalid credentials, but that's overkill for a liveness probe.
async function checkCloudinary(): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(cloudName && apiKey && apiSecret);
}
