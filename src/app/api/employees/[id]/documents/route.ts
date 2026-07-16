import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, requireStoreId, logAudit } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { uploadToCloudinary, getSignedUrl } from "@/lib/cloudinary";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

// AUDIT-FIX C-12: Employee documents (CNIC scans, contracts, salary slips)
// are now uploaded as PRIVATE Cloudinary assets. The stored `url` is a
// signed URL valid for 1 hour — callers who need to display the document
// later must re-generate via GET (added in Sprint 4) or call getSignedUrl
// with the stored publicId.
//
// The `publicId` is stored permanently so we can regenerate signed URLs
// on demand. The `url` field is the signed URL at upload time — it will
// expire, but the publicId won't.
export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireManager();
    const storeId = requireStoreId(session);
    const { id } = await params;

    // Verify employee belongs to this store
    const employee = await prisma.employee.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!employee) throw new HttpError("Employee not found", 404, "NOT_FOUND");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "other";

    if (!file) throw new HttpError("No file uploaded", 400, "VALIDATION_ERROR");

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      throw new HttpError(
        "Invalid file type. Only JPG, PNG, WEBP, and PDF are allowed.",
        400,
        "INVALID_FILE_TYPE",
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new HttpError(
        "File size exceeds 5MB limit.",
        400,
        "FILE_TOO_LARGE",
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // FIX P2-11: Validate file magic bytes — don't trust the client-provided
    // MIME type. An attacker can upload a .exe with Content-Type: image/jpeg.
    // We check the first few bytes against known signatures.
    const MAGIC_BYTES: Record<string, number[]> = {
      "image/jpeg": [0xff, 0xd8, 0xff],
      "image/png": [0x89, 0x50, 0x4e, 0x47],
      "image/webp": [0x52, 0x49, 0x46, 0x46], // "RIFF" (WebP container)
      "application/pdf": [0x25, 0x50, 0x44, 0x46], // "%PDF"
    };
    const expectedMagic = MAGIC_BYTES[file.type];
    if (expectedMagic) {
      const actualMagic = Array.from(buffer.subarray(0, expectedMagic.length));
      const matches = expectedMagic.every(
        (byte, i) => actualMagic[i] === byte,
      );
      if (!matches) {
        throw new HttpError(
          "File content does not match its type. The file may be corrupted or disguised.",
          400,
          "INVALID_FILE_CONTENT",
        );
      }
    }

    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await uploadToCloudinary(base64, "employee-documents");

    // AUDIT-FIX C-12: For private assets, generate a signed URL for the
    // response. The stored `url` is this signed URL (valid 1 hour). The
    // `publicId` is permanent — callers regenerate signed URLs via GET.
    const isPdf = file.type === "application/pdf";
    const url = result.isPrivate
      ? getSignedUrl(result.public_id, isPdf ? "raw" : "image", 3600)
      : result.secure_url;

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        storeId,
        type,
        url,
        publicId: result.public_id,
      },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "DOCUMENT_UPLOADED",
      entityType: "EmployeeDocument",
      entityId: doc.id,
      details: {
        employeeId: id,
        type,
        publicId: result.public_id,
        private: result.isPrivate,
      } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ document: doc }, "Document uploaded successfully", 201);
  },
);
