import type { Metadata } from "next";
import { adminOverview, requirePlatformAdmin } from "@/lib/admin";
import { getPlan, getProduct } from "@/lib/billing/plans";
import { AppTopBar } from "@/components/app-shell";
import { Card, Input, statusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePlatformAdmin();
  const { q } = await searchParams;
  const { orgs, stats } = await adminOverview(q?.slice(0, 80));

  const tiles = [
    { label: "MRR", value: `$${stats.mrr.toLocaleString()}` },
    { label: "Paying", value: stats.active },
    { label: "In trial", value: stats.trialing },
    { label: "Past due", value: stats.pastDue },
    { label: "Orgs", value: stats.orgs },
    { label: "Users", value: stats.users },
  ];

  return (
    <>
      <AppTopBar user={user} orgName="Platform admin" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <Card key={t.label} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className="mt-1 text-2xl font-bold">{t.value}</p>
            </Card>
          ))}
        </div>

        <form className="mt-8 max-w-sm">
          <Input name="q" defaultValue={q} placeholder="Search orgs by name…" />
        </form>

        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Org</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Storage</th><th className="px-4 py-3">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3"><p className="font-medium">{o.name}</p><p className="text-xs text-slate-400">{o.slug}</p></td>
                  <td className="px-4 py-3 text-slate-600">{o.memberships[0]?.user.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {o.subscriptions.length === 0 ? <span className="text-slate-400">none</span> : (
                      <div className="space-y-1">
                        {o.subscriptions.map((s) => (
                          <div key={s.id} className="flex items-center gap-2">
                            <span>{getProduct(s.product)?.name} · {getPlan(s.product, s.planKey)?.name}</span>{statusBadge(s.status)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{o._count.memberships}</td>
                  <td className="px-4 py-3">{(Number(o.storageUsedBytes) / 1e9).toFixed(2)} GB</td>
                  <td className="px-4 py-3 text-slate-500">{o.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
              {orgs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No orgs found.</td></tr>}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
