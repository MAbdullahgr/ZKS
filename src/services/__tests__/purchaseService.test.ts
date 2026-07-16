import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock accountingService — purchaseService imports postPurchaseReceiptJournalEntry.
vi.mock("@/services/accountingService", () => ({
  postPurchaseReceiptJournalEntry: vi.fn().mockResolvedValue({ id: "je-p" }),
}));

// Mock inventoryService — purchaseService.receivePurchaseOrder calls receiveStock.
// We only test createPurchaseOrder + serializePurchaseOrder in this file, so a
// no-op mock is sufficient.
vi.mock("@/services/inventoryService", () => ({
  receiveStock: vi.fn().mockResolvedValue({
    batchId: "b1",
    adjustmentId: "a1",
    previousStock: 0,
    newStock: 0,
  }),
}));

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    supplier: {
      findFirst: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    purchaseOrder: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/prisma";
import {
  createPurchaseOrder,
  serializePurchaseOrder,
} from "@/services/purchaseService";
import { HttpError } from "@/lib/api-error";

const mockedPrisma = prisma as unknown as {
  supplier: { findFirst: ReturnType<typeof vi.fn> };
  product: { findMany: ReturnType<typeof vi.fn> };
  purchaseOrder: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPurchaseOrder", () => {
  beforeEach(() => {
    // Default: supplier exists, all products exist. Make findMany return
    // exactly the products that were asked for so the length check passes.
    mockedPrisma.supplier.findFirst.mockResolvedValue({ id: "sup-1" });
    mockedPrisma.product.findMany.mockImplementation((args?: {
      where?: { id?: { in?: string[] } };
    }) => {
      const ids = args?.where?.id?.in ?? [];
      return Promise.resolve(ids.map((id) => ({ id })));
    });
  });

  it("creates a PO with the correct totals and order number", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({
        id: "po-1",
        orderNumber: "PO-1234567890",
        ...(args as object),
      });
    });

    const result = await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [
        { productId: "p1", quantity: 5, unitCost: 100 },
        { productId: "p2", quantity: 2, unitCost: 250 },
      ],
    });

    expect(result).toBeDefined();
    expect(captured).toHaveLength(1);

    const callArg = captured[0] as {
      data: {
        storeId: string;
        supplierId: string;
        orderNumber: string;
        totalAmount: number;
        status: string;
        items: { create: Array<{ total: number }> };
      };
    };
    expect(callArg.data.storeId).toBe("s1");
    expect(callArg.data.supplierId).toBe("sup-1");
    expect(callArg.data.status).toBe("draft");
    expect(callArg.data.totalAmount).toBe(1000); // 5*100 + 2*250
    expect(callArg.data.items.create[0].total).toBe(500);
    expect(callArg.data.items.create[1].total).toBe(500);
  });

  it("computes totalAmount = sum(qty * unitCost)", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "po-2", ...(args as object) });
    });

    await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [{ productId: "p1", quantity: 3, unitCost: 250 }],
    });

    const callArg = captured[0] as {
      data: { totalAmount: number };
    };
    expect(callArg.data.totalAmount).toBe(750);
  });

  it("handles a single-item PO", async () => {
    mockedPrisma.purchaseOrder.create.mockResolvedValue({
      id: "po-3",
      orderNumber: "PO-x",
    });

    const result = await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
    });

    expect(result).toBeDefined();
  });

  it("passes notes and expectedDate when provided", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "po-4", ...(args as object) });
    });

    const expectedDate = new Date("2027-12-31");
    await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      expectedDate,
      notes: "Urgent",
      items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
    });

    const callArg = captured[0] as {
      data: { expectedDate: Date; notes: string };
    };
    expect(callArg.data.expectedDate).toEqual(expectedDate);
    expect(callArg.data.notes).toBe("Urgent");
  });

  it("defaults notes to null when not provided", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "po-5", ...(args as object) });
    });

    await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
    });

    const callArg = captured[0] as {
      data: { notes: string | null };
    };
    expect(callArg.data.notes).toBeNull();
  });

  it("defaults expectedDate to null when not provided", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "po-6", ...(args as object) });
    });

    await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
    });

    const callArg = captured[0] as {
      data: { expectedDate: Date | null };
    };
    expect(callArg.data.expectedDate).toBeNull();
  });

  it("throws NOT_FOUND when the supplier does not exist", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue(null);

    await expect(
      createPurchaseOrder({
        storeId: "s1",
        supplierId: "missing",
        items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
      }),
    ).rejects.toThrow(HttpError);
  });

  it("throws VALIDATION_ERROR when one or more products don't belong to store", async () => {
    // Override findMany to return fewer products than requested.
    mockedPrisma.product.findMany.mockResolvedValue([{ id: "p1" }]); // p2 missing

    await expect(
      createPurchaseOrder({
        storeId: "s1",
        supplierId: "sup-1",
        items: [
          { productId: "p1", quantity: 1, unitCost: 10 },
          { productId: "p2", quantity: 1, unitCost: 10 },
        ],
      }),
    ).rejects.toThrow(HttpError);
  });

  it("rejects a negative unit cost", async () => {
    await expect(
      createPurchaseOrder({
        storeId: "s1",
        supplierId: "sup-1",
        items: [{ productId: "p1", quantity: 1, unitCost: -10 }],
      }),
    ).rejects.toThrow(HttpError);
  });

  it("rejects a negative quantity", async () => {
    await expect(
      createPurchaseOrder({
        storeId: "s1",
        supplierId: "sup-1",
        items: [{ productId: "p1", quantity: -5, unitCost: 10 }],
      }),
    ).rejects.toThrow(HttpError);
  });

  it("generates an order number starting with PO-", async () => {
    const captured: unknown[] = [];
    mockedPrisma.purchaseOrder.create.mockImplementation((args: unknown) => {
      captured.push(args);
      return Promise.resolve({ id: "po-7", ...(args as object) });
    });

    await createPurchaseOrder({
      storeId: "s1",
      supplierId: "sup-1",
      items: [{ productId: "p1", quantity: 1, unitCost: 10 }],
    });

    const callArg = captured[0] as {
      data: { orderNumber: string };
    };
    expect(callArg.data.orderNumber).toMatch(/^PO-\d+$/);
  });
});

describe("serializePurchaseOrder", () => {
  // Build a sample PO payload that matches the Prisma include shape.
  const samplePo = {
    id: "po-1",
    storeId: "s1",
    supplierId: "sup-1",
    orderNumber: "PO-123",
    status: "ordered" as const,
    orderDate: new Date("2027-01-15T10:00:00Z"),
    expectedDate: new Date("2027-01-20T10:00:00Z"),
    receivedDate: null,
    totalAmount: 1000,
    notes: "Test notes",
    supplier: { id: "sup-1", name: "Acme" },
    items: [
      {
        id: "item-1",
        productId: "p1",
        quantity: 5,
        unitCost: 100,
        total: 500,
        receivedQty: 0,
        product: { name: "Widget", sku: "W-1", stockQuantity: 10 },
      },
      {
        id: "item-2",
        productId: "p2",
        quantity: 2,
        unitCost: 250,
        total: 500,
        receivedQty: 2,
        product: { name: "Gadget", sku: "G-1", stockQuantity: 5 },
      },
    ],
  };

  it("returns the order with the totalAmount as a Number", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.totalAmount).toBe(1000);
    expect(typeof serialized.totalAmount).toBe("number");
  });

  it("serializes each item's Decimal fields to numbers", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.items[0].quantity).toBe(5);
    expect(serialized.items[0].unitCost).toBe(100);
    expect(serialized.items[0].total).toBe(500);
    expect(serialized.items[0].receivedQty).toBe(0);
    expect(serialized.items[1].receivedQty).toBe(2);
  });

  it("computes subtotal as sum of item totals", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.subtotal).toBe(1000);
  });

  it("hardcodes taxAmount = 0 (POs don't currently track tax)", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.taxAmount).toBe(0);
  });

  it("serializes dates to ISO strings", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(typeof serialized.orderDate).toBe("string");
    expect(serialized.orderDate).toBe("2027-01-15T10:00:00.000Z");
    expect(serialized.expectedDate).toBe("2027-01-20T10:00:00.000Z");
    expect(serialized.receivedDate).toBeUndefined();
  });

  it("serializes receivedDate when present", () => {
    const poWithReceived = {
      ...samplePo,
      receivedDate: new Date("2027-01-18T10:00:00Z"),
    };
    const serialized = serializePurchaseOrder(
      poWithReceived as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.receivedDate).toBe("2027-01-18T10:00:00.000Z");
  });

  it("preserves the supplier and items array", () => {
    const serialized = serializePurchaseOrder(
      samplePo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.supplier.name).toBe("Acme");
    expect(serialized.items).toHaveLength(2);
  });

  it("handles an empty items array (subtotal = 0)", () => {
    const emptyPo = { ...samplePo, items: [] };
    const serialized = serializePurchaseOrder(
      emptyPo as unknown as Parameters<typeof serializePurchaseOrder>[0],
    );
    expect(serialized.subtotal).toBe(0);
    expect(serialized.items).toEqual([]);
  });
});
