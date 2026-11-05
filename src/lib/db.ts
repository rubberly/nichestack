import { PrismaClient } from "@prisma/client";

/**
 * RAW, UNSCOPED client. Only a short allowlist of files may import this (enforced by
 * tests/permissions.test.ts). Everything else must use `requireOrg()` from lib/tenancy.ts,
 * which hands back a client that is locked to one org.
 */
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
