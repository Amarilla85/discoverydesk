import { PrismaClient } from "@prisma/client";

// Prisma client singleton (ARCH-1). In dev the instance is stored on
// globalThis so Next.js hot-reload doesn't open a new pool per change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
