import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateSettingsSchema } from "@/lib/validations/settings";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { moneyToNumber } from "@/lib/money";

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  // FIX P2-8: Use requireStoreId instead of getStoreFilter. The old code used
  // getStoreFilter, which returns storeId as undefined for owner in All Stores
  // mode. The OR clause then matched ALL settings rows (storeId: undefined is
  // treated as "no filter"), returning an arbitrary store's settings. Worse,
  // if no settings existed, it created a new one with storeId: null — a
  // global default that would be returned for every store. requireStoreId
  // forces the owner to pick a specific store first.
  const storeId = requireStoreId(session);

  // Find settings for this store only (no global fallback — each store should
  // have its own settings row, created by the seed script)
  let settings = await prisma.settings.findFirst({
    where: { storeId },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        code: `store-${storeId}`,
        storeId,
        storeName: "ZKS Store",
        address: "",
        phone: "",
        currency: "Rs.",
        taxRate: 0,
      },
    });
  }

  const { pin, ...safeSettings } = settings;
  void pin;
  // A+ FIX: taxRate is a Prisma Decimal — without explicit conversion, Prisma
  // serializes it as a STRING ("17.00"), while the PATCH handler below returns
  // it as a NUMBER (17). The client (settings/page.tsx:71) defensively wraps
  // with Number() so it didn't crash, but the inconsistency is a latent bug.
  // Route every Decimal through moneyToNumber for a consistent number shape.
  // (The full A+ end-state is moneyToString → "17.00"; see MIGRATION_TO_A_PLUS.md.)
  return apiSuccess({
    settings: {
      ...safeSettings,
      taxRate: moneyToNumber(safeSettings.taxRate),
      pinConfigured: !!pin,
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAuth("admin");
  const storeId = requireStoreId(session);

  const body = await req.json();
  const updateData = updateSettingsSchema.parse(body);

  if (Object.keys(updateData).length === 0) {
    throw new HttpError("No valid fields to update", 400, "VALIDATION_ERROR");
  }

  // Find or create store-specific settings
  let settings = await prisma.settings.findFirst({
    where: { storeId },
  });

  if (settings) {
    settings = await prisma.settings.update({
      where: { id: settings.id },
      data: updateData,
    });
  } else {
    settings = await prisma.settings.create({
      data: {
        code: `store-${storeId}`,
        storeId,
        storeName: "ZKS Store",
        address: "",
        phone: "",
        currency: "Rs.",
        taxRate: 0,
        ...updateData,
      },
    });
  }

  await logAudit({
    userId: session.userId,
    storeId,
    action: "SETTINGS_UPDATED",
    entityType: "Settings",
    details: { updates: updateData } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  const { pin, ...safeSettings } = settings;
  void pin;
  // A+ FIX: Use moneyToNumber here too for consistency with GET above.
  return apiSuccess({
    settings: {
      ...safeSettings,
      taxRate: moneyToNumber(safeSettings.taxRate),
    },
  });
});
