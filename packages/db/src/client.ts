/** Shared Prisma client (lazy, memoized). Kept separate so other db modules can import it
 * without a cycle through index.ts. */
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export { PrismaClient };
