// vitest.setup.ts
//
// Global test setup. Stubs out the generated Prisma client + the prisma
// singleton so that source modules which import Prisma types / enums at
// runtime (e.g. `Prisma.TransactionIsolationLevel.Serializable`,
// `Prisma.PrismaClientKnownRequestError`) can load under Vitest.
//
// Background: the generated Prisma client at src/generated/prisma/internal/
// class.ts imports `@prisma/client/runtime/client`, which Vitest cannot
// resolve because that sub-path uses Node-conditional exports that the
// Vite resolver doesn't honour. By mocking `@/generated/prisma/client` and
// `@/lib/prisma` here, we short-circuit the load chain entirely.
//
// Individual test files can override these mocks with their own
// `vi.mock("@/lib/prisma", () => ({ prisma: { ... } }))` to provide
// specific stubs for the methods they exercise.

import { vi } from "vitest";

// ─── Mock @/generated/prisma/client ──────────────────────────────────────
//
// Returns STABLE class instances for *Error properties (so `instanceof`
// works in source code that does `error instanceof Prisma.XxxError`).
//
// Other namespaces (e.g. `Prisma.TransactionIsolationLevel.Serializable`)
// return a Proxy that yields the property name as a string. This is good
// enough for runtime access where the source code just needs SOME value.

// Pre-build the error classes ONCE so instanceof checks work consistently
// across source files + test files (they share the same module mock).
const PrismaClientKnownRequestError = class FakePrismaClientKnownRequestError extends Error {
  code?: string;
  meta?: unknown;
  clientVersion?: string;
  constructor(
    message: string,
    opts?: { code?: string; meta?: unknown; clientVersion?: string },
  ) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = opts?.code;
    this.meta = opts?.meta;
    this.clientVersion = opts?.clientVersion;
  }
};

const PrismaClientUnknownRequestError = class FakePrismaClientUnknownRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrismaClientUnknownRequestError";
  }
};

const PrismaClientInitializationError = class FakePrismaClientInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrismaClientInitializationError";
  }
};

// Build the Prisma namespace object. For any other property access (e.g.
// `Prisma.SaleCountArgs`, `Prisma.ModelUpdateInput`), fall back to a Proxy
// that returns the property name as a string. These are type-only in real
// code, but if accessed at runtime we want a sane value rather than
// `undefined`.
const prismaNamespace = new Proxy(
  {
    PrismaClientKnownRequestError,
    PrismaClientUnknownRequestError,
    PrismaClientInitializationError,
    // Common namespace proxies (yield the property name as a string).
    TransactionIsolationLevel: new Proxy(
      {},
      { get: (_t, p) => (typeof p === "string" ? p : undefined) },
    ),
  },
  {
    get(target, prop) {
      if (prop in target) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      }
      // Fallback for any other Prisma.* access — return a Proxy so nested
      // accesses (e.g. Prisma.UserScalarFieldEnum.email) return strings.
      if (typeof prop === "string") {
        return new Proxy(
          {},
          { get: (_t, p) => (typeof p === "string" ? p : undefined) },
        );
      }
      return undefined;
    },
  },
);

vi.mock("@/generated/prisma/client", () => ({
  Prisma: prismaNamespace,
  // Enums used at runtime by services (e.g. `InventoryReferenceType.purchase`).
  // Returned as Proxies so that `InventoryReferenceType.purchase` resolves to
  // "purchase".
  UserRole: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
  AccountType: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
  JournalReferenceType: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
  ReturnStatus: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
  InventoryReferenceType: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
  PurchaseOrderStatus: new Proxy(
    {},
    { get: (_t, p) => (typeof p === "string" ? p : undefined) },
  ),
}));

// ─── Mock @/lib/prisma ───────────────────────────────────────────────────
//
// Provide a no-op prisma singleton. Test files that need specific stubs
// override this with their own vi.mock("@/lib/prisma", ...).

const noopPrisma = new Proxy(
  {},
  {
    get(_target, _modelName) {
      // For any prisma.<model>.<method> call, return a function that
      // resolves to undefined.
      return new Proxy(
        {},
        {
          get(_t2, _methodName) {
            return vi.fn().mockResolvedValue(undefined);
          },
        },
      );
    },
  },
) as unknown as {
  $transaction: (...args: unknown[]) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

// $transaction needs to invoke the callback with a "tx" client that itself
// has model proxies.
noopPrisma.$transaction = vi.fn(
  async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb(noopPrisma);
  },
) as never;

vi.mock("@/lib/prisma", () => ({ prisma: noopPrisma }));
