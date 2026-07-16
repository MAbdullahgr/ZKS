import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  getStoreFilter,
  requireStoreId,
  logAudit,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { createCustomerSchema } from "@/lib/validations/customer";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

// Customers are now store-scoped (multi-company architecture).
// Each store has its own customers. Khata balance is per-store.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  // FIX: Warehouse is excluded from Customers module — block API access too.
  if (session.role === "warehouse") {
    throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
  }
  const { storeId } = getStoreFilter(session);
  const sp = new URL(req.url).searchParams;
  const forPos = sp.get("forPos") === "true";
  const withBalance = sp.get("withBalance") === "true";
  const search = sp.get("search") ?? "";
  const { page, limit, skip } = parsePagination(req);

  const where = {
    storeId,
    isActive: true,
    ...(withBalance ? { balance: { gt: 0 } } : {}),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ],
    }),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        store: { select: { name: true } },
        _count: { select: { sales: true, khataTransactions: true } },
      },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const serialized = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || "",
    email: c.email || "",
    address: c.address || "",
    balance: Number(c.balance),
    creditLimit: Number(c.creditLimit),
    createdAt: c.createdAt,
    _count: c._count,
    store: c.store,
  }));

  if (forPos) {
    return apiSuccess({
      customers: serialized.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || "-",
        balance: c.balance,
        creditLimit: c.creditLimit,
      })),
    });
  }

  return apiSuccess({ customers: serialized, ...paginatedMeta(page, limit, total) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const session = await requireAuth();
  // FIX: Warehouse is excluded from Customers module — block API access too.
  if (session.role === "warehouse") {
    throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
  }
  const storeId = requireStoreId(session);
  const body = await req.json();
  const { name, phone, email, address, creditLimit } =
    createCustomerSchema.parse(body);

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name,
      phone: phone || null,
      email: email?.toLowerCase().trim() || null,
      address: address || null,
      creditLimit,
    },
  });

  await logAudit({
    userId: session.userId,
    storeId,
    action: "CUSTOMER_CREATED",
    entityType: "Customer",
    entityId: customer.id,
    details: { name, phone } as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
    userAgent,
  });

  return apiSuccess(
    {
      customer: {
        ...customer,
        balance: Number(customer.balance),
        creditLimit: Number(customer.creditLimit),
      },
    },
    "Customer created successfully",
    201,
  );
});
