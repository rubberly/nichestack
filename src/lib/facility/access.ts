import { redirect } from "next/navigation";
import { requireOrg } from "../tenancy";
import type { Permission } from "../permissions";
import { activeSub, limitsFor } from "../billing/entitlements";

/** requireOrg + the org must have an active Storage Facility plan. Returns plan limits too. */
export async function requireFacility(slug: string, permission: Permission = "org:read") {
  const ctx = await requireOrg(slug, permission);
  const subs = await ctx.db.subscription.findMany();
  if (!activeSub(subs, "FACILITY")) redirect(`/app/${slug}/billing?need=FACILITY`);
  const limits = limitsFor(subs, "FACILITY")!;
  return { ...ctx, limits };
}
