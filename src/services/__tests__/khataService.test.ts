import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the accounting service — recordKhata + recordSupplierPayment both post
// a journal entry via accountingService. Mock so we don't drag in Prisma.
vi.mock("@/services/accountingService", () => ({
  postKhataPaymentJournalEntry: vi.fn().mockResolvedValue({ id: "je-k" }),
  postSupplierPaymentJournalEntry: vi.fn().mockResolvedValue({ id: "je-s" }),
}));

// Mock Prisma before importing the service so the service picks up our mock.
vi.mock("@/lib/prisma", () => {
  const innerPrisma = {
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    khataTransaction: {
      create: vi.fn(),
    },
    supplier: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    supplierLedger: {
      create: vi.fn(),
    },
  };
  // $transaction runs the callback with `innerPrisma` as the tx client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => {
    return cb(innerPrisma);
  });
  return { prisma: { ...innerPrisma, $transaction } };
});

import { prisma } from "@/lib/prisma";
import { recordKhata, recordSupplierPayment } from "@/services/khataService";
import { HttpError } from "@/lib/api-error";

const mockedPrisma = prisma as unknown as {
  customer: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  khataTransaction: { create: ReturnType<typeof vi.fn> };
  supplier: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  supplierLedger: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordKhata — payment type", () => {
  it("decrements the customer balance by the payment amount", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 1500,
      creditLimit: 5000,
      name: "Test Customer",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "khata-1" });
    mockedPrisma.customer.update.mockResolvedValue({});

    const result = await recordKhata({
      customerId: "cust-1",
      storeId: "store-1",
      amount: 500,
      type: "payment",
      note: "Cash payment",
    });

    expect(result.transactionId).toBe("khata-1");
    expect(result.newBalance).toBe(1000);
    expect(mockedPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: { balance: { decrement: 500 } },
    });
  });

  it("uses a default note when none is provided", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 100,
      creditLimit: null,
      name: "Test",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "khata-2" });
    mockedPrisma.customer.update.mockResolvedValue({});

    await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 50,
      type: "payment",
    });

    expect(mockedPrisma.khataTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: "Payment received" }),
      }),
    );
  });

  it("wraps the two writes in a $transaction", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 100,
      creditLimit: null,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "k-tx" });
    mockedPrisma.customer.update.mockResolvedValue({});

    await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 50,
      type: "payment",
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("recordKhata — advance type", () => {
  it("decrements the customer balance (advance payment)", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 200,
      creditLimit: 1000,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "k-3" });
    mockedPrisma.customer.update.mockResolvedValue({});

    const result = await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 200,
      type: "advance",
    });

    expect(result.newBalance).toBe(0);
  });

  it("uses the 'Advance payment' default note", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 0,
      creditLimit: null,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "x" });
    mockedPrisma.customer.update.mockResolvedValue({});

    await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 100,
      type: "advance",
    });

    expect(mockedPrisma.khataTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: "Advance payment" }),
      }),
    );
  });
});

describe("recordKhata — return_credit type", () => {
  it("decrements the customer balance (return refund reduces debt)", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 500,
      creditLimit: null,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "k-4" });
    mockedPrisma.customer.update.mockResolvedValue({});

    const result = await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 100,
      type: "return_credit",
    });

    expect(result.newBalance).toBe(400);
  });

  it("uses the 'Return refund' default note", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 500,
      creditLimit: null,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "k-r" });
    mockedPrisma.customer.update.mockResolvedValue({});

    await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 100,
      type: "return_credit",
    });

    expect(mockedPrisma.khataTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: "Return refund" }),
      }),
    );
  });
});

describe("recordKhata — return_cash type", () => {
  it("does NOT change the customer balance (handled by register)", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 250,
      creditLimit: null,
      name: "C",
    });
    mockedPrisma.khataTransaction.create.mockResolvedValue({ id: "k-5" });

    const result = await recordKhata({
      customerId: "c1",
      storeId: "s1",
      amount: 100,
      type: "return_cash",
    });

    expect(result.newBalance).toBe(250);
    expect(mockedPrisma.customer.update).not.toHaveBeenCalled();
  });
});

describe("recordKhata — error cases", () => {
  it("throws NOT_FOUND when the customer does not exist", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      recordKhata({
        customerId: "missing",
        storeId: "s1",
        amount: 50,
        type: "payment",
      }),
    ).rejects.toThrow(HttpError);
  });

  it("rejects unknown types with VALIDATION_ERROR", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({
      balance: 100,
      creditLimit: null,
      name: "C",
    });

    await expect(
      recordKhata({
        customerId: "c1",
        storeId: "s1",
        amount: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "credit" as any,
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe("recordSupplierPayment", () => {
  it("decrements the supplier balance by the payment amount", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue({
      balance: 5000,
      name: "Acme Corp",
    });
    mockedPrisma.supplierLedger.create.mockResolvedValue({ id: "ledger-1" });
    mockedPrisma.supplier.update.mockResolvedValue({});

    const result = await recordSupplierPayment({
      supplierId: "sup-1",
      storeId: "s1",
      amount: 1000,
      type: "payment",
    });

    expect(result.newBalance).toBe(4000);
    expect(mockedPrisma.supplier.update).toHaveBeenCalledWith({
      where: { id: "sup-1" },
      data: { balance: { decrement: 1000 } },
    });
  });

  it("uses a default note based on the supplier name for payments", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue({
      balance: 100,
      name: "Acme",
    });
    mockedPrisma.supplierLedger.create.mockResolvedValue({ id: "x" });
    mockedPrisma.supplier.update.mockResolvedValue({});

    await recordSupplierPayment({
      supplierId: "sup-1",
      storeId: "s1",
      amount: 100,
      type: "payment",
    });

    expect(mockedPrisma.supplierLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: "Payment to Acme" }),
      }),
    );
  });

  it("uses a default note based on the supplier name for debits", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue({
      balance: 100,
      name: "Acme",
    });
    mockedPrisma.supplierLedger.create.mockResolvedValue({ id: "x" });
    mockedPrisma.supplier.update.mockResolvedValue({});

    await recordSupplierPayment({
      supplierId: "sup-1",
      storeId: "s1",
      amount: 100,
      type: "debit",
    });

    expect(mockedPrisma.supplierLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: "Refund/Return from Acme",
        }),
      }),
    );
  });

  it("wraps the writes in a $transaction", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue({
      balance: 100,
      name: "Acme",
    });
    mockedPrisma.supplierLedger.create.mockResolvedValue({ id: "x" });
    mockedPrisma.supplier.update.mockResolvedValue({});

    await recordSupplierPayment({
      supplierId: "sup-1",
      storeId: "s1",
      amount: 100,
      type: "payment",
    });

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("throws NOT_FOUND when the supplier does not exist", async () => {
    mockedPrisma.supplier.findFirst.mockResolvedValue(null);

    await expect(
      recordSupplierPayment({
        supplierId: "missing",
        storeId: "s1",
        amount: 100,
        type: "payment",
      }),
    ).rejects.toThrow(HttpError);
  });
});
