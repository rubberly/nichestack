import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDailyJobs } from "@/lib/facility/daily";

// Vercel Cron calls this daily with "Authorization: Bearer $CRON_SECRET" (see vercel.json).
// Locally: curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDailyJobs();
  return NextResponse.json(result);
}
