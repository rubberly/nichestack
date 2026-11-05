import Link from "next/link";
import type { Metadata } from "next";
import { requireFacility } from "@/lib/facility/access";
import { daysPastDue, fmtMoney, isOverdue, monthsOwed } from "@/lib/facility/rent";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { FacilityForm } from "./facility-form";

export const metadata: Metadata = { title: "Storage Facility" };

export default async function FacilityDashboard({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireFacility(orgSlug);
  const facilities = await ctx.db.facility.findMany({ orderBy: { createdAt: "asc" } });

  if (facilities.length === 0) {
    return (
      <>
        <PageHeader title="Set up your facility" subtitle="Two minutes. You can change everything later." />
        <Card className="max-w-xl"><FacilityForm slug={orgSlug} /></Card>
      </>
    );
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [units, leases, paidThisMonth] = await Promise.all([
    ctx.db.unit.groupBy({ by: ["status"], _count: true, _sum: { monthlyPriceCents: true } }),
    ctx.db.lease.findMany({ where: { status: "ACTIVE" }, include: { contact: true, unit: { include: { facility: true } } } }),
    ctx.db.rentPayment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
  ]);

  const count = (s: string) => units.find((u) => u.status === s)?._count ?? 0;
  const total = units.reduce((n, u) => n + u._count, 0);
  const occupied = count("OCCUPIED");
  const occupancy = total ? Math.round((occupied / total) * 100) : 0;
  const rentRoll = leases.reduce((n, l) => n + l.monthlyRentCents, 0);
  const vacantValue = units.find((u) => u.status === "AVAILABLE")?._sum.monthlyPriceCents ?? 0;
  const overdue = leases
    .filter((l) => isOverdue(l.paidThrough, l.unit.facility.graceDays, now))
    .map((l) => ({ l, days: daysPastDue(l.paidThrough, now), owed: l.monthlyRentCents * Math.max(1, monthsOwed(l.paidThrough, now)) }))
    .sort((a, b) => b.days - a.days);
  const overdueTotal = overdue.reduce((n, o) => n + o.owed, 0);
  const autopay = leases.filter((l) => l.autopay).length;

  const tiles = [
    { label: "Occupancy", value: `${occupancy}%`, sub: `${occupied} of ${total} units` },
    { label: "Collected this month", value: fmtMoney(paidThisMonth._sum.amountCents ?? 0), sub: `Rent roll ${fmtMoney(rentRoll)}/mo` },
    { label: "Overdue", value: fmtMoney(overdueTotal), sub: `${overdue.length} tenant${overdue.length === 1 ? "" : "s"}`, warn: overdue.length > 0 },
    { label: "Empty units", value: `${fmtMoney(vacantValue)}/mo`, sub: `${count("AVAILABLE")} available to rent` },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${facilities.map((f) => f.name).join(", ")} · ${autopay} of ${leases.length} tenants on autopay`}
        action={<ButtonLink href={`/book/${facilities[0].slug}`} variant="secondary" target="_blank">View booking page ↗</ButtonLink>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className={`p-4 ${t.warn ? "border-red-200 bg-red-50" : ""}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
            <p className={`mt-1 text-2xl font-bold ${t.warn ? "text-red-700" : ""}`}>{t.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Overdue tenants</h2>
          <span className="text-xs text-slate-500">Reminders go out automatically on days 1, 5, 10 and 20</span>
        </div>
        {overdue.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Everyone is paid up. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overdue.map(({ l, days, owed }) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <p className="font-medium">{l.contact.name} <span className="text-slate-400">· unit {l.unit.label}</span></p>
                  <p className="text-sm text-slate-500">{l.contact.email}{l.contact.phone && ` · ${l.contact.phone}`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={days > 10 ? "red" : "amber"}>{days} days late</Badge>
                  <span className="font-semibold">{fmtMoney(owed)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-100 px-5 py-3 text-sm">
          <Link href={`/app/${orgSlug}/facility/tenants`} className="font-medium text-brand-600 hover:underline">All tenants →</Link>
        </div>
      </Card>
    </>
  );
}
