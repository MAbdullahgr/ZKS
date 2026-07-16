import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, createSession, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAuth("admin"); // Only admin/owner can switch stores

  // AUDIT-FIX (5-b LOW-2): Rate-limit store-switching. A compromised admin JWT
  // could otherwise spam PATCH /api/auth/store thousands of times per second,
  // churning the cookie + audit log (DoS / log-flooding).
  const rl = await rateLimit("mutation", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many store-switch requests. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const { storeId } = body;

  // If storeId is null, it means "All Stores" (admin view)
  if (storeId !== null) {
    // Verify store exists and is active
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { isActive: true },
    });
    if (!store || !store.isActive) {
      throw new HttpError("Store not found or inactive", 404, "NOT_FOUND");
    }
  }

  // Re-issue session with the new storeId
  await createSession(session.userId, storeId);

  await logAudit({
    userId: session.userId,
    action: "STORE_CONTEXT_CHANGED",
    details: { newStoreId: storeId } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { message: "Store context updated" },
    undefined,
    200,
    rateLimitHeaders(rl),
  );
});
