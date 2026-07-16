import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withErrorHandler, HttpError } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";
import { Prisma } from "@generated/prisma/client";

// AUDIT-FIX (lint): Typed the sale payload instead of `any`. Derived from the
// exact findFirst include shape used in both code paths below.
type SaleWithRelations = Prisma.SaleGetPayload<{
  include: {
    items: {
      include: {
        product: { select: { name: true; sku: true; imageUrl: true } };
      };
    };
    customer: true;
    payments: true;
    registerSession: { select: { userId: true; storeId: true } };
  };
}>;

function serializeSaleByRole(sale: SaleWithRelations, role: string) {
  const isManagerOrAbove = ["manager", "admin", "owner"].includes(role);

  return {
    ...sale,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    paidAmount: Number(sale.paidAmount),
    items: sale.items.map((item) => {
      if (isManagerOrAbove) {
        return {
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          costPrice: Number(item.costPrice),
          discount: Number(item.discount),
          total: Number(item.total),
          profit: Number(item.profit),
        };
      }
      // Cashier/warehouse: strip costPrice + profit
      const { costPrice: _cp, profit: _pf, ...safeItem } = item;
      void _cp;
      void _pf;
      return {
        ...safeItem,
        quantity: Number(safeItem.quantity),
        unitPrice: Number(safeItem.unitPrice),
        discount: Number(safeItem.discount),
        total: Number(safeItem.total),
      };
    }),
    payments: sale.payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
    })),
  };
}

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(
  async (_req: NextRequest, { params }) => {
    const session = await requireAuth();
    const { id } = await params;

    // AUDIT-FIX (5-b MEDIUM-3): Build the WHERE clause with the authorization
    // scope baked in so cross-store / cross-session access returns a clean 404
    // (no existence leak via 403-vs-404 oracle). Previously the sale was
    // fetched by findUnique({where:{id}}) with NO storeId filter, then authz
    // was checked AFTER the fetch — a 403 meant "sale exists but not yours",
    // a 404 meant "sale doesn't exist", leaking sale-ID existence across stores.
    //
    // - cashier/warehouse: scoped to their own register session
    // - manager: scoped to their store
    // - owner/admin: no scope (can view any sale)
    let where: { id: string; storeId?: string };
    if (session.role === "owner" || session.role === "admin") {
      where = { id };
    } else if (session.role === "manager") {
      where = { id, storeId: session.storeId! };
    } else {
      // cashier / warehouse — scope via the registerSession relation.
      // Use findFirst with a relation filter (findUnique can't filter by
      // a related model's field in the where clause).
      const sale = await prisma.sale.findFirst({
        where: {
          id,
          registerSession: { userId: session.userId },
        },
        include: {
          items: {
            include: {
              product: { select: { name: true, sku: true, imageUrl: true } },
            },
          },
          customer: true,
          payments: true,
          registerSession: {
            select: { userId: true, storeId: true },
          },
        },
      });
      if (!sale) throw new HttpError("Sale not found", 404, "NOT_FOUND");
      return apiSuccess({ sale: serializeSaleByRole(sale, session.role) });
    }

    const sale = await prisma.sale.findFirst({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true, sku: true, imageUrl: true } },
          },
        },
        customer: true,
        payments: true,
        registerSession: {
          select: { userId: true, storeId: true },
        },
      },
    });

    if (!sale) throw new HttpError("Sale not found", 404, "NOT_FOUND");

    return apiSuccess({ sale: serializeSaleByRole(sale, session.role) });
  },
);
