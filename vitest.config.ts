import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Run ALL test files. The setup file (vitest.setup.ts) stubs the
    // generated Prisma client + prisma singleton so source files that import
    // Prisma types/enums at runtime can load without pulling in the native
    // @prisma/client/runtime/client binding (which Vitest can't resolve).
    //
    // Individual test files override specific methods via
    // `vi.mock("@/lib/prisma", ...)` for finer-grained behavior.
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next", "src/generated"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/services/**/*.ts"],
      exclude: ["src/generated/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@prisma/client": path.resolve(__dirname, "./src/generated/prisma"),
      "@generated/prisma": path.resolve(__dirname, "./src/generated/prisma"),
      "@generated/prisma/*": path.resolve(
        __dirname,
        "./src/generated/prisma/*",
      ),
    },
  },
});
