import Link from "next/link";
import { requireOrg } from "@/lib/tenancy";
import { can } from "@/lib/permissions";
import { PRODUCTS, getPlan } from "@/lib/billing/plans";
import { hasAccess, seatLimit } from "@/lib/billing/entitlements";
import { ButtonLink, Card, Meter, PageHeader, statusBadge } from "@/components/ui";

const ICON: Record<string, string> = { FACILITY: "🏬", PORTAL: "🪪", PHOTOVAULT: "📸", QUOTEFOLLOW: "📨" };

export default async function Overview({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const [subs, members, recent] = await Promise.all([
    ctx.db.subscription.findMany(),
    ctx.db.membership.count(),
    ctx.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const anyActive = subs.some(hasAccess);
  const canBill = can(ctx.role, "billing:manage");

  return (
    <>
      <PageHeader title={`Welcome back`} subtitle={ctx.org.name} />

      {!anyActive && canBill && (
        <Card className="mb-6 border-brand-100 bg-brand-50">
          <h2 className="font-semibold">Start your free trial</h2>
          <p className="mt-1 text-sm text-slate-600">Pick a product to unlock it. No charge until the trial ends.</p>
          <ButtonLink href={`/app/${orgSlug}/billing`} className="mt-3">Choose a product</ButtonLink>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {PRODUCTS.map((p) => {
          const sub = subs.find((s) => s.product === p.key);
          const on = hasAccess(sub);
          return (
            <Card key={p.key} className={on ? "" : "opacity-70"}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-2xl" aria-hidden>{ICON[p.key]}</div>
                  <h2 className="mt-1 font-semibold">{p.name}</h2>
                </div>
                {sub ? statusBadge(sub.status) : null}
              </div>
              <p className="mt-1 text-sm text-slate-600">{p.tagline}</p>
              <p className="mt-3 text-sm">
                {on ? (
                  <span className="text-slate-700">{getPlan(p.key, sub!.planKey)?.name} plan · <span className="text-slate-500">workspace opens in Phase {p.phase}</span></span>
                ) : canBill ? (
                  <Link href={`/app/${orgSlug}/billing`} className="font-medium text-brand-600 hover:underline">Start free trial →</Link>
                ) : (
                  <span className="text-slate-500">Ask an owner to turn this on.</span>
                )}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Usage</h2>
          <div className="space-y-4">
            <Meter label="Team seats" used={members} limit={seatLimit(subs)} />
            <Meter label="File storage (MB)" used={Math.round(Number(ctx.org.storageUsedBytes) / 1e6)} limit={null} />
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Recent activity</h2>
          {recent.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
            <ul className="space-y-2 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="text-slate-700">{r.action.replace(/[._]/g, " ")}</span>
                  <span className="shrink-0 text-slate-400">{r.createdAt.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
