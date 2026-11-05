import { notFound } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./tenancy";
import { mrr } from "./billing/entitlements";

/** Platform admin (you) only. Everyone else gets a 404. */
export async function requirePlatformAdmin() {
  const user = await requireUser("/admin");
  if (!user.isPlatformAdmin) notFound();
  return user;
}

export async function adminOverview(q?: string) {
  await requirePlatformAdmin();
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q } }] } : {};
  const [orgs, orgCount, userCount, subs] = await Promise.all([
    db.org.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        subscriptions: true,
        _count: { select: { memberships: true } },
        memberships: { where: { role: "OWNER" }, take: 1, include: { user: { select: { email: true } } } },
      },
    }),
    db.org.count(),
    db.user.count(),
    db.subscription.findMany({ select: { product: true, planKey: true, status: true } }),
  ]);
  const byStatus = (s: string) => subs.filter((x) => x.status === s).length;
  return {
    orgs,
    stats: {
      orgs: orgCount,
      users: userCount,
      active: byStatus("active"),
      trialing: byStatus("trialing"),
      pastDue: byStatus("past_due"),
      mrr: mrr(subs),
    },
  };
}
