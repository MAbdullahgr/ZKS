import { Pool, PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

let prismaClient: PrismaClient | null = null;

/** Detect if the database host is local (no SSL needed) */
function isLocalhost(url: string): boolean {
  try {
    const match = url.match(/@([^/:]+)/);
    if (!match) return false;
    const host = match[1].toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** Build pg.Pool config that works for both local and remote DBs */
function getPoolConfig(): PoolConfig {
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const isLocal = isLocalhost(connectionString);

  const config: PoolConfig = {
    connectionString,
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
  };

  if (isLocal) {
    config.connectionString = connectionString
      .replace(/([?&])sslmode=[^&]*/g, "")
      .replace(/[?&]$/, "");
    config.ssl = false;
  } else {
    if (!connectionString.includes("sslmode=")) {
      config.connectionString =
        connectionString +
        (connectionString.includes("?") ? "&" : "?") +
        "sslmode=require";
    }
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function getPrismaClient(): PrismaClient {
  if (prismaClient) return prismaClient;

  const pool = new Pool(getPoolConfig());
  const adapter = new PrismaPg(pool);
  prismaClient = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    const globalForPrisma = globalThis as unknown as {
      prisma: PrismaClient | undefined;
    };
    if (globalForPrisma.prisma) {
      prismaClient = globalForPrisma.prisma;
    } else {
      globalForPrisma.prisma = prismaClient;
    }
  }

  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getPrismaClient(), prop);
  },
});
