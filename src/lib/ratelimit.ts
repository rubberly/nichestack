import { db } from "./db";

/**
 * Fixed-window rate limiter stored in Postgres (no Redis needed). One atomic upsert per call.
 * Returns ok=false once `limit` hits are used within `windowSec`.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const { count, resetAt } = rows[0];
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}
