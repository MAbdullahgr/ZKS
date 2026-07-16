import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireWarehouse,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createSupplierSchema } from "@/lib/validations/supplier";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

export const GET = withErrorHandler(async (req: NextRequest) => {
  // FIX: Cashier should not access supplier data — change from requireAuth()
  // to requireWarehouse(). The POST already uses requireWarehouse().
  const session = await requireWarehouse();
  const { storeId } = getStoreFilter(session);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where = {
    storeId,
    isActive: true,
    ...(search && {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
        { contactPerson: { contains: search } },
      ],
    }),
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        balance: true,
        store: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  return apiSuccess({
    suppliers: suppliers.map((s) => ({ ...s, balance: Number(s.balance) })),
    ...paginatedMeta(page, limit, total),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireWarehouse();
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { name, contactPerson, email, phone, address } =
    createSupplierSchema.parse(body);

  const supplier = await prisma.supplier.create({
    data: {
      storeId,
      name,
      contactPerson: contactPerson || null,
      email: email?.toLowerCase().trim() || null,
      phone: phone || null,
      address: address || null,
    },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      email: true,
      phone: true,
      address: true,
      isActive: true,
      balance: true,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "SUPPLIER_CREATED",
    entityType: "Supplier",
    entityId: supplier.id,
    details: { name } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    { supplier: { ...supplier, balance: Number(supplier.balance) } },
    "Supplier created successfully",
    201,
  );
});
