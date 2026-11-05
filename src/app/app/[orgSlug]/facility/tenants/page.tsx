import type { Metadata } from "next";
import { requireFacility } from "@/lib/facility/access";
import { daysPastDue, fmtMoney, isOverdue } from "@/lib/facility/rent";
import { appUrl } from "@/lib/site";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { moveIn, moveOut, recordPayment, sendPayLink } from "../actions";

export const metadata: Metadata = { title: "Tenants" };

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function TenantsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireFacility(orgSlug);
  const now = new Date();
  const [leases, available] = await Promise.all([
    ctx.db.lease.findMany({
      where: { status: { in: ["ACTIVE", "PENDING"] } },
      include: { contact: true, unit: { include: { facility: true } }, payments: { orderBy: { paidAt: "desc" }, take: 1 } },
      orderBy: { paidThrough: "asc" },
    }),
    ctx.db.unit.findMany({ where: { status: "AVAILABLE" }, orderBy: { label: "asc" }, take: 500 }),
  ]);

  return (
    <>
      <PageHeader title="Tenants" subtitle={`${leases.length} current · ${leases.filter((l) => l.autopay).length} on autopay`} />

      {available.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Move in a tenant</h2>
          <ActionForm action={moveIn.bind(null, orgSlug)} className="grid gap-3 sm:grid-cols-6 sm:items-end">
            <label><Label>Unit</Label>
              <Select name="unitId" className="w-full">{available.map((u) => <option key={u.id} value={u.id}>{u.label} · {fmtMoney(u.monthlyPriceCents)}</option>)}</Select>
            </label>
            <label className="sm:col-span-2"><Label>Name</Label><Input name="name" required /></label>
            <label className="sm:col-span-2"><Label>Email</Label><Input name="email" type="email" required /></label>
            <label><Label>Phone</Label><Input name="phone" /></label>
            <label><Label>Rent ($/mo)</Label><Input name="rent" inputMode="decimal" defaultValue={(available[0].monthlyPriceCents / 100).toFixed(2)} required /></label>
            <label className="sm:col-span-2"><Label>First month</Label>
              <Select name="paid" className="w-full">
                <option value="none">Not paid yet (send them a pay link)</option>
                <option value="cash">Paid in cash</option><option value="check">Paid by check</option><option value="other">Paid another way</option>
              </Select>
            </label>
            <div className="sm:col-span-3"><SubmitButton>Move in</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      <div className="space-y-3">
        {leases.map((l) => {
          const days = daysPastDue(l.paidThrough, now);
          const late = isOverdue(l.paidThrough, l.unit.facility.graceDays, now);
          return (
            <Card key={l.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{l.contact.name} <span className="font-normal text-slate-400">· unit {l.unit.label} · {fmtMoney(l.monthlyRentCents)}/mo</span></p>
                  <p className="truncate text-sm text-slate-500">{l.contact.email}{l.contact.phone && ` · ${l.contact.phone}`}</p>
                  <p className="mt-1 text-sm">
                    Paid through <strong>{fmtDate(l.paidThrough)}</strong>
                    {l.payments[0] && <span className="text-slate-400"> · last payment {fmtMoney(l.payments[0].amountCents)} ({l.payments[0].method}) on {fmtDate(l.payments[0].paidAt)}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.status === "PENDING" && <Badge color="blue">booking: awaiting payment</Badge>}
                  {l.autopay && <Badge color="green">autopay</Badge>}
                  {late ? <Badge color="red">{days} days late</Badge> : days >= 0 && l.status === "ACTIVE" ? <Badge color="amber">due</Badge> : null}
                </div>
              </div>
              {l.status === "ACTIVE" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <form action={recordPayment.bind(null, orgSlug)} className="flex items-center gap-1">
                    <input type="hidden" name="leaseId" value={l.id} />
                    <Select name="months" aria-label="Months" defaultValue="1">{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mo</option>)}</Select>
                    <Select name="method" aria-label="Method"><option value="cash">cash</option><option value="check">check</option><option value="other">other</option></Select>
                    <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Record payment</button>
                  </form>
                  {!l.autopay && (
                    <form action={sendPayLink.bind(null, orgSlug)}>
                      <input type="hidden" name="leaseId" value={l.id} />
                      <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Email pay / autopay link</button>
                    </form>
                  )}
                  <a href={appUrl(`/pay/${l.payToken}`)} target="_blank" className="px-2 text-sm text-brand-600 hover:underline">Pay page ↗</a>
                  <form action={moveOut.bind(null, orgSlug)} className="ml-auto">
                    <input type="hidden" name="leaseId" value={l.id} />
                    <button className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">Move out</button>
                  </form>
                </div>
              )}
            </Card>
          );
        })}
        {leases.length === 0 && <Card className="text-center text-sm text-slate-500">No tenants yet.</Card>}
      </div>
    </>
  );
}
