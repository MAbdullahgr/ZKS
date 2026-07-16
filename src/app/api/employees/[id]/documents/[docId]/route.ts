import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// AUDIT-FIX H-37: DELETE route for employee documents. Previously only POST
// existed — once a document was uploaded, it could never be removed via the
// API. This route:
//   1. Verifies the document belongs to an employee in the caller's store
//   2. Deletes the file from Cloudinary (orphaned-file prevention)
//   3. Deletes the DB record
//   4. Audit-logs the deletion
//
// The Cloudinary deletion is inside a try/catch — if Cloudinary is
// unavailable, we still delete the DB record (so the user sees the doc is
// gone) and log the orphaned-file warning. A future cleanup cron can
// reconcile orphaned Cloudinary files.
export const DELETE = withErrorHandler<{
  params: Promise<{ id: string; docId: string }>;
}>(async (req: NextRequest, { params }) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireManager();
  const storeId = requireStoreId(session);
  const { id: employeeId, docId } = await params;

  // AUDIT-FIX H-28: Rate-limit document deletions.
  const rl = await rateLimit("mutation", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many deletions. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  // Verify the document exists AND belongs to an employee in this store.
  // The compound where clause prevents cross-store deletion via guessed IDs.
  const doc = await prisma.employeeDocument.findFirst({
    where: { id: docId, employeeId, storeId },
    select: { id: true, publicId: true, type: true, url: true },
  });

  if (!doc) {
    throw new HttpError("Document not found", 404, "NOT_FOUND");
  }

  // Delete from Cloudinary first (if we have a publicId). If this fails,
  // we still proceed with the DB delete — the user wants the doc gone
  // from the UI, and a future cleanup cron can reconcile orphaned files.
  let cloudinaryDeleted = false;
  if (doc.publicId) {
    try {
      cloudinaryDeleted = await deleteFromCloudinary(doc.publicId);
    } catch (err) {
      // Log but don't block — the DB record will be deleted, the file
      // becomes an orphan that a cleanup cron should catch.
      console.error("[cloudinary] Failed to delete document", {
        publicId: doc.publicId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await prisma.employeeDocument.delete({ where: { id: docId } });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "DOCUMENT_DELETED",
    entityType: "EmployeeDocument",
    entityId: docId,
    details: {
      employeeId,
      type: doc.type,
      cloudinaryDeleted,
    } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { cloudinaryDeleted },
    "Document deleted successfully",
    200,
    rateLimitHeaders(rl),
  );
});
