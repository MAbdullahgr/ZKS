import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireManager,
  requireStoreId,
  logAudit,
  getStoreFilter,
} from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { updateCustomerSchema } from "@/lib/validations/customer";
import { Prisma } from "@generated/prisma/client";
import { getClientIp } from "@/lib/rate-limit";

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireAuth();
    // FIX: Warehouse is excluded from Customers module — block API access too.
    if (session.role === "warehouse") throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
    const { storeId } = getStoreFilter(session);
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
      include: {
        khataTransactions: {
          orderBy: { createdAt: "desc" },
          include: { sale: { select: { saleNumber: true, total: true } } },
        },
        sales: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            items: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });

    if (!customer) throw new HttpError("Customer not found", 404, "NOT_FOUND");

    const serializedCustomer = {
      ...customer,
      balance: Number(customer.balance),
      creditLimit: Number(customer.creditLimit),
      khataTransactions: customer.khataTransactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        sale: t.sale ? { ...t.sale, total: Number(t.sale.total) } : undefined,
      })),
      sales: customer.sales.map((s) => ({
        ...s,
        total: Number(s.total),
        paidAmount: Number(s.paidAmount),
        items: s.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
      })),
    };

    return apiSuccess({ customer: serializedCustomer });
  },
);

export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const session = await requireAuth();
    // FIX: Warehouse is excluded from Customers module — block API access too.
    if (session.role === "warehouse") throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
    const storeId = requireStoreId(session);
    const { id } = await params;
    const body = await req.json();
    const updateData = updateCustomerSchema.parse(body);

    // Verify customer belongs to this store
    const existing = await prisma.customer.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new HttpError("Customer not found", 404, "NOT_FOUND");

    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase().trim();
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "CUSTOMER_UPDATED",
      entityType: "Customer",
      entityId: id,
      details: { updates: updateData } as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({
      customer: {
        ...customer,
        balance: Number(customer.balance),
        creditLimit: Number(customer.creditLimit),
      },
    });
  },
);

export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const ip = getClientIp(_req);
    const userAgent = _req.headers.get("user-agent") ?? "unknown";

    // AUDIT-FIX H-3: Bumped from requireAuth() to requireManager().
    // Customer deletion is a manager-tier action — cashiers ringing sales
    // shouldn't be able to mass-deactivate customer records before a
    // manager audit. The PATCH (edit customer) stays open to cashiers.
    const session = await requireManager();
    // FIX: Warehouse is excluded from Customers module — block API access too.
    if (session.role === "warehouse") throw new HttpError("Warehouse staff cannot access customer data", 403, "FORBIDDEN");
    const storeId = requireStoreId(session);
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, storeId },
      select: { balance: true },
    });

    if (!customer) throw new HttpError("Customer not found", 404, "NOT_FOUND");

    if (Number(customer.balance) > 0) {
      throw new HttpError(
        "Cannot delete customer with outstanding balance. Clear khata first.",
        409,
        "BALANCE_DUE",
      );
    }

    await prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: session.userId,
      storeId,
      action: "CUSTOMER_DELETED",
      entityType: "Customer",
      entityId: id,
      ipAddress: ip,
      userAgent,
    });

    return apiSuccess({ message: "Customer deactivated successfully" });
  },
);
