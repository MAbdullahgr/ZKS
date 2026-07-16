import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the accounting service — adjustStock posts a non-blocking JE via
// accountingService, which would otherwise try to hit the (mocked) prisma
// singleton and produce noisy console errors.
vi.mock("@/services/accountingService", () => ({
  postInventoryAdjustmentJournalEntry: vi
    .fn()
    .mockResolvedValue({ id: "je-1" }),
}));

// Mock Prisma so we can test the service in isolation.
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    product: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryAdjustment: {
      create: vi.fn(),
    },
    productBatch: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/prisma";
import { adjustStock, receiveStock } from "@/services/inventoryService";
import { HttpError } from "@/lib/api-error";

const mockedPrisma = prisma as unknown as {
  product: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  inventoryAdjustment: { create: ReturnType<typeof vi.fn> };
  productBatch: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("adjustStock — type=add", () => {
  it("increments stock and records the correct newStock", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 10,
      name: "Widget",
      costPrice: 50,
    });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-1" });

    const result = await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "add",
      quantity: 5,
      reason: "Manual add",
    });

    expect(result.previousStock).toBe(10);
    expect(result.newStock).toBe(15);
    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stockQuantity: { increment: 5 } },
    });
  });
});

describe("adjustStock — type=remove", () => {
  it("decrements stock atomically via updateMany with gte guard", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 20,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-2" });

    const result = await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "remove",
      quantity: 3,
    });

    expect(result.newStock).toBe(17);
    expect(mockedPrisma.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "p1",
        stockQuantity: { gte: 3 },
      },
      data: { stockQuantity: { decrement: 3 } },
    });
  });

  it("throws INSUFFICIENT_STOCK when updateMany reports count=0", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 1,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 0 });
    // Re-read for error message
    mockedPrisma.product.findFirst
      .mockResolvedValueOnce({
        id: "p1",
        stockQuantity: 1,
        name: "W",
        costPrice: 10,
      })
      .mockResolvedValueOnce({ stockQuantity: 1 });

    await expect(
      adjustStock({
        storeId: "s1",
        productId: "p1",
        type: "remove",
        quantity: 5,
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe("adjustStock — type=damage", () => {
  it("decrements stock (damage is treated like a remove)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 50,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-3" });

    const result = await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "damage",
      quantity: 2,
      reason: "Broken in transit",
    });

    expect(result.newStock).toBe(48);
  });
});

describe("adjustStock — type=return", () => {
  it("increments stock (return is treated like an add)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 8,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-4" });

    const result = await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "return",
      quantity: 1,
    });

    expect(result.newStock).toBe(9);
    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stockQuantity: { increment: 1 } },
    });
  });
});

describe("adjustStock — type=set", () => {
  it("sets stock to the exact quantity", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 7,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-5" });

    const result = await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "set",
      quantity: 100,
    });

    expect(result.previousStock).toBe(7);
    expect(result.newStock).toBe(100);
    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stockQuantity: 100 },
    });
  });
});

describe("adjustStock — validation", () => {
  it("rejects negative quantity", async () => {
    await expect(
      adjustStock({
        storeId: "s1",
        productId: "p1",
        type: "add",
        quantity: -1,
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe("adjustStock — error cases", () => {
  it("throws NOT_FOUND when the product does not exist", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    await expect(
      adjustStock({
        storeId: "s1",
        productId: "missing",
        type: "add",
        quantity: 1,
      }),
    ).rejects.toThrow(HttpError);
  });

  it("creates the InventoryAdjustment with a null reason when none provided", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 0,
      name: "W",
      costPrice: 10,
    });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-6" });

    await adjustStock({
      storeId: "s1",
      productId: "p1",
      type: "add",
      quantity: 1,
    });

    expect(mockedPrisma.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: null }),
      }),
    );
  });
});

describe("receiveStock", () => {
  it("creates a ProductBatch, increments stock, and records an adjustment", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 10,
      name: "W",
    });
    mockedPrisma.productBatch.create.mockResolvedValue({ id: "batch-1" });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "adj-7" });

    const result = await receiveStock({
      storeId: "s1",
      productId: "p1",
      quantity: 5,
      costPrice: 100,
      batchNumber: "BATCH-001",
      expiryDate: new Date("2027-12-31"),
    });

    expect(result.batchId).toBe("batch-1");
    expect(result.adjustmentId).toBe("adj-7");
    expect(result.previousStock).toBe(10);
    expect(result.newStock).toBe(15);

    expect(mockedPrisma.productBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p1",
          quantity: 5,
          costPrice: 100,
          batchNumber: "BATCH-001",
        }),
      }),
    );

    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stockQuantity: { increment: 5 } },
    });
  });

  it("uses a default reason when none is provided", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "p1",
      stockQuantity: 0,
      name: "W",
    });
    mockedPrisma.productBatch.create.mockResolvedValue({ id: "b1" });
    mockedPrisma.product.update.mockResolvedValue({});
    mockedPrisma.inventoryAdjustment.create.mockResolvedValue({ id: "a1" });

    await receiveStock({
      storeId: "s1",
      productId: "p1",
      quantity: 5,
      costPrice: 50,
    });

    expect(mockedPrisma.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "Received batch N/A" }),
      }),
    );
  });

  it("rejects negative cost price", async () => {
    await expect(
      receiveStock({
        storeId: "s1",
        productId: "p1",
        quantity: 1,
        costPrice: -10,
      }),
    ).rejects.toThrow(HttpError);
  });

  it("rejects negative quantity", async () => {
    await expect(
      receiveStock({
        storeId: "s1",
        productId: "p1",
        quantity: -1,
        costPrice: 10,
      }),
    ).rejects.toThrow(HttpError);
  });

  it("throws NOT_FOUND when the product does not exist", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    await expect(
      receiveStock({
        storeId: "s1",
        productId: "missing",
        quantity: 1,
        costPrice: 10,
      }),
    ).rejects.toThrow(HttpError);
  });
});
