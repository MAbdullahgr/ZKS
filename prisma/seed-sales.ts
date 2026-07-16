// prisma/seed-sales.ts
//
// Generates realistic historical sales data so the dashboard, reports, and
// sales list pages show meaningful data instead of Rs 0 / empty states.
//
// Creates ~600 sales across the last 90 days, spread across all 4 stores,
// with 1-5 items each. Random customers, payment methods, and dates weighted
// toward more recent days (so "today" and "this week" have data).
//
// Idempotent: checks if sales already exist and skips if so.

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

// Weighted date: 40% in last 7 days, 30% in last 8-30 days, 30% in last 31-90 days
function weightedDate(now: Date): Date {
  const roll = Math.random();
  let daysAgo: number;
  if (roll < 0.4) {
    daysAgo = randomInt(0, 6); // last 7 days
  } else if (roll < 0.7) {
    daysAgo = randomInt(7, 29); // last 8-30 days
  } else {
    daysAgo = randomInt(30, 89); // last 31-90 days
  }
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  // Random time during business hours (9am - 10pm)
  d.setHours(randomInt(9, 22), randomInt(0, 59), randomInt(0, 59), 0);
  return d;
}

const PAYMENT_METHODS = [
  "cash",
  "card",
  "mobile",
  "easypaisa",
  "jazzcash",
  "khata",
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const existingCount = await prisma.sale.count();
  if (existingCount > 0) {
    console.log(
      `⚠️  Found ${existingCount} existing sales. Skipping seed (run db:reset first to re-seed).`,
    );
    return;
  }

  console.log("🌱 Seeding historical sales data...");

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  console.log(`  Found ${stores.length} stores`);

  // Load products + customers per store
  const storeData = await Promise.all(
    stores.map(async (store) => {
      const [products, customers] = await Promise.all([
        prisma.product.findMany({
          where: { storeId: store.id, isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            costPrice: true,
            stockQuantity: true,
          },
        }),
        prisma.customer.findMany({
          where: { storeId: store.id },
          select: { id: true, name: true },
        }),
      ]);
      return { store, products, customers };
    }),
  );

  const now = new Date();
  const TARGET_TOTAL_SALES = 600;
  const salesPerStore = Math.ceil(TARGET_TOTAL_SALES / stores.length);

  let totalCreated = 0;
  let saleSeq = 1;

  for (const { store, products, customers } of storeData) {
    if (products.length === 0) {
      console.log(`  [${store.name}] No products — skipping`);
      continue;
    }

    console.log(
      `  [${store.name}] Creating ${salesPerStore} sales (${products.length} products, ${customers.length} customers)`,
    );

    for (let i = 0; i < salesPerStore; i++) {
      const saleDate = weightedDate(now);
      const dateStr = saleDate
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      // 1-5 items per sale
      const itemCount = randomInt(1, 5);
      const usedProductIds = new Set<string>();
      const items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        costPrice: number;
        taxRate: number;
        taxAmount: number;
        total: number;
        profit: number;
      }> = [];

      for (let j = 0; j < itemCount; j++) {
        // Pick a product not already in this sale
        let product = pick(products);
        let attempts = 0;
        while (usedProductIds.has(product.id) && attempts < 10) {
          product = pick(products);
          attempts++;
        }
        if (usedProductIds.has(product.id)) continue;
        usedProductIds.add(product.id);

        const unitPrice = Number(product.sellingPrice);
        const costPrice = Number(product.costPrice);
        // Quantity: 1-3 for most, up to 10 for some
        const quantity = Math.random() < 0.8 ? randomInt(1, 3) : randomInt(4, 10);
        // 20% chance of a small item-level discount
        const discount =
          Math.random() < 0.2 ? Math.round(unitPrice * quantity * 0.05) : 0;

        const taxRate = 0; // Simplified: no per-item tax in seed
        const lineTotal = unitPrice * quantity - discount;
        const taxAmount = 0;
        const profit = (unitPrice - costPrice) * quantity - discount;

        items.push({
          productId: product.id,
          quantity,
          unitPrice,
          discount,
          costPrice,
          taxRate,
          taxAmount,
          total: lineTotal,
          profit,
        });
      }

      if (items.length === 0) continue;

      const subtotal = items.reduce((sum, it) => sum + it.total, 0);
      const tax = 0;
      // 15% chance of a sale-level discount
      const saleDiscount =
        Math.random() < 0.15 ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal - saleDiscount;

      // Payment method
      const paymentMethod = pick([...PAYMENT_METHODS]);
      // For khata (credit), paidAmount = 0; otherwise paid = total
      const paidAmount = paymentMethod === "khata" ? 0 : total;

      // Customer: 60% walk-in (null), 40% a real customer
      const customer =
        customers.length > 0 && Math.random() < 0.4
          ? pick(customers)
          : null;

      const saleNumber = `SALE-${dateStr}-${saleSeq.toString().padStart(6, "0")}`;
      saleSeq++;

      const sale = await prisma.sale.create({
        data: {
          storeId: store.id,
          saleNumber,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          saleDate,
          status: "completed",
          subtotal,
          tax,
          discount: saleDiscount,
          total,
          paidAmount,
          paymentMethod: paymentMethod as never,
          taxRateSnapshot: 0,
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: it.discount,
              costPrice: it.costPrice,
              taxRate: it.taxRate,
              taxAmount: it.taxAmount,
              total: it.total,
              profit: it.profit,
            })),
          },
        },
      });

      // If khata (credit) sale with a customer, record a khata transaction
      if (paymentMethod === "khata" && customer) {
        await prisma.khataTransaction.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            saleId: sale.id,
            type: "credit",
            amount: total,
            balanceAfter: total, // Simplified — real service computes running balance
            note: `Sale ${saleNumber}`,
          },
        });
      }

      totalCreated++;
    }
  }

  console.log(`✅ Created ${totalCreated} sales across ${stores.length} stores`);

  // Summary stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = await prisma.sale.count({
    where: { saleDate: { gte: todayStart } },
  });
  const todayRevenue = await prisma.sale.aggregate({
    _sum: { total: true },
    where: { saleDate: { gte: todayStart } },
  });
  console.log(
    `   Today: ${todaySales} sales, Rs ${Number(todayRevenue._sum.total ?? 0).toLocaleString()} revenue`,
  );

  const totalRevenue = await prisma.sale.aggregate({
    _sum: { total: true },
  });
  console.log(
    `   Total: Rs ${Number(totalRevenue._sum.total ?? 0).toLocaleString()} revenue across all sales`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
