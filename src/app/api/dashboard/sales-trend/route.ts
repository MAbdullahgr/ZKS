// GET /api/dashboard/sales-trend
// Returns daily revenue + count for the last N days (default 7) for the
// dashboard mini-chart. Respects store scoping (owner sees all stores).
import { prisma } from "@/lib/prisma";
import { requireAuth, getStoreFilterOrNull } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-error";
import { apiSuccess } from "@/lib/api-response";

export const GET = withErrorHandler(async (request: Request) => {
  const session = await requireAuth();
  const storeFilter = getStoreFilterOrNull(session);
  const storeCondition = storeFilter ? { storeId: storeFilter.storeId } : {};

  // Parse ?days= param (default 7, max 30)
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10), 1), 30);

  // Cashiers don't get revenue trend data
  if (session.role === "cashier") {
    return apiSuccess({ days: 0, trend: [], roleScope: "cashier" });
  }

  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  // Aggregate sales by day
  const sales = await prisma.sale.findMany({
    where: {
      saleDate: { gte: startDate, lte: now },
      ...storeCondition,
      status: "completed",
    },
    select: {
      saleDate: true,
      total: true,
    },
  });

  // Build a complete date series (fill missing days with 0)
  const trend: { date: string; revenue: number; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    trend.push({ date: dateKey, revenue: 0, count: 0 });
  }

  const dayMap = new Map(trend.map((t) => [t.date, t]));

  for (const sale of sales) {
    const dateKey = sale.saleDate.toISOString().slice(0, 10);
    const entry = dayMap.get(dateKey);
    if (entry) {
      entry.revenue += Number(sale.total);
      entry.count += 1;
    }
  }

  const totalRevenue = trend.reduce((sum, t) => sum + t.revenue, 0);
  const totalSales = trend.reduce((sum, t) => sum + t.count, 0);

  return apiSuccess({
    days,
    trend,
    totalRevenue,
    totalSales,
    avgDailyRevenue: days > 0 ? Math.round(totalRevenue / days) : 0,
    roleScope: "manager+",
  });
});
