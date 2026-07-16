import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { PaymentMethod, SaleStatus } from "@generated/prisma/client";
import { Prisma } from "@generated/prisma/client";
import { HttpError, withErrorHandler } from "@/lib/api-error";
import { apiSuccess, rateLimitHeaders } from "@/lib/api-response";
import { createSaleSchema } from "@/lib/validations/sale";
import { createSale, serializeSale } from "@/services/saleService";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// ─── GET /api/sales — list sales ─────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  // FIX: Warehouse is excluded from Sales module — block API access too.
  // The POST already has this check; the GET was missed.
  if (session.role === "warehouse") {
    throw new HttpError(
      "Warehouse staff cannot access sales data",
      403,
      "FORBIDDEN",
    );
  }
  const { storeId } = getStoreFilter(session);

  const { searchParams } = new URL(req.url);
  const { page, limit, skip } = parsePagination(req);
  const search = searchParams.get("search") ?? "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const paymentMethod = searchParams.get("paymentMethod");
  const status = searchParams.get("status");

  const where: Prisma.SaleWhereInput = {
    // Cashiers only see sales they rang up (warehouse is blocked above)
    ...(session.role === "cashier"
      ? { registerSession: { userId: session.userId } }
      : {}),
    // Store scoping (owners in "All Stores" mode see cross-store)
    ...(storeId && { storeId }),
    ...(search && {
      OR: [
        { saleNumber: { contains: search } },
        { taxInvoiceNumber: { contains: search } },
        { customerName: { contains: search } },
        { customer: { name: { contains: search } } },
      ],
    }),
    ...(from && { saleDate: { gte: new Date(from) } }),
    ...(to && { saleDate: { lte: new Date(`${to}T23:59:59`) } }),
    ...(paymentMethod && { paymentMethod: paymentMethod as PaymentMethod }),
    ...(status && { status: status as SaleStatus }),
  };

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        customer: { select: { name: true, phone: true } },
        payments: true,
        store: { select: { name: true } },
        registerSession: {
          select: {
            user: {
              select: {
                email: true,
                employee: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return apiSuccess({
    sales: sales.map((s) => serializeSale(s, session.role)),
    ...paginatedMeta(page, limit, total),
  });
});

// ─── POST /api/sales — create sale ───────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  // FIX: warehouse role (weight 2) sits ABOVE cashier (weight 1) in the role
  // hierarchy, so `requireAuth("cashier")` would admit warehouse. POS
  // operations are reserved for {cashier, manager, admin, owner} — explicitly
  // reject warehouse staff.
  if (session.role === "warehouse") {
    throw new HttpError(
      "Warehouse staff cannot operate the POS",
      403,
      "FORBIDDEN",
    );
  }
  // FIX P1-13: Use requireStoreId instead of resolveStoreId. Owner in All
  // Stores mode should get a clear "select a store" error, not silently
  // attribute the sale to the first store.
  const targetStoreId = requireStoreId(session);

  // AUDIT-FIX H-28: Rate-limit sale creation per user+IP. 100/min generic
  // is too generous for sales (a compromised cashier could script 100
  // sales/min = 6000/hour draining inventory). Use the financialMutation
  // surface (20/min) — still generous for normal POS use (a fast cashier
  // does ~2 sales/min peak), blocks scripted abuse.
  const ip = getClientIp(req);
  const rl = await rateLimit("financialMutation", `${session.userId}:${ip}`);
  if (!rl.success) {
    throw new HttpError(
      "Too many sales submitted. Please slow down.",
      429,
      "RATE_LIMITED",
      rateLimitHeaders(rl),
    );
  }

  const body = await req.json();
  const validatedData = createSaleSchema.parse(body);

  // Delegate to the service layer
  const result = await createSale(validatedData, {
    userId: session.userId,
    storeId: targetStoreId,
  });

  await logAudit({
    userId: session.userId,
    storeId: targetStoreId,
    action: "SALE_CREATED",
    entityType: "Sale",
    entityId: result.saleId,
    details: {
      saleNumber: result.saleNumber,
      taxInvoiceNumber: result.taxInvoiceNumber,
    } as unknown as Prisma.InputJsonValue,
    // FIX P3-4: Use getClientIp helper instead of hand-rolling IP extraction.
    // getClientIp handles x-forwarded-for, x-real-ip, and falls back correctly.
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? "unknown",
  });

  return apiSuccess(result, "Sale completed successfully", 201, rateLimitHeaders(rl));
});
