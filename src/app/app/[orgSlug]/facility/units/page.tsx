import type { Metadata } from "next";
import { requireFacility } from "@/lib/facility/access";
import { fmtMoney } from "@/lib/facility/rent";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { addUnits, deleteUnit, updateUnit } from "../actions";

export const metadata: Metadata = { title: "Units" };

const COLOR = { AVAILABLE: "green", RESERVED: "blue", OCCUPIED: "gray", MAINTENANCE: "amber" } as const;

export default async function UnitsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ status?: string }> }) {
  const { orgSlug } = await params;
  const { status } = await searchParams;
  const ctx = await requireFacility(orgSlug);
  const filter = ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE"].includes(status ?? "") ? (status as keyof typeof COLOR) : undefined;
  const [facilities, units, total] = await Promise.all([
    ctx.db.facility.findMany({ orderBy: { createdAt: "asc" } }),
    ctx.db.unit.findMany({
      where: filter ? { status: filter } : {},
      include: { facility: { select: { name: true } }, leases: { where: { status: { not: "ENDED" } }, include: { contact: { select: { name: true } } }, take: 1 } },
      orderBy: [{ facilityId: "asc" }, { label: "asc" }],
      take: 1000,
    }),
    ctx.db.unit.count(),
  ]);

  return (
    <>
      <PageHeader title="Units" subtitle={`${total} of ${ctx.limits.units ?? "unlimited"} units on your plan`} />

      {facilities.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Add units</h2>
          <ActionForm action={addUnits.bind(null, orgSlug)} className="grid gap-3 sm:grid-cols-6 sm:items-end">
            <label className="sm:col-span-2"><Label>Facility</Label>
              <Select name="facilityId" className="w-full">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            </label>
            <label><Label hint="(optional)">Prefix</Label><Input name="prefix" placeholder="A" maxLength={10} /></label>
            <label><Label>From #</Label><Input name="from" type="number" min={0} defaultValue={1} required /></label>
            <label><Label>To #</Label><Input name="to" type="number" min={0} defaultValue={10} required /></label>
            <label><Label>Size</Label><Input name="size" placeholder="10x10" /></label>
            <label className="sm:col-span-2"><Label>Monthly price ($)</Label><Input name="price" inputMode="decimal" placeholder="95" required /></label>
            <div className="sm:col-span-4"><SubmitButton>Add units</SubmitButton></div>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">Example: prefix A, from 1 to 20 creates units A1 to A20. Moving from other software? Use <a className="underline" href={`/app/${orgSlug}/facility/import`}>Import</a>.</p>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {["", "AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"].map((s) => (
          <a key={s} href={s ? `?status=${s}` : "?"} className={`rounded-full px-3 py-1 ${filter === s || (!filter && !s) ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {s ? s.toLowerCase() : "all"}
          </a>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Size · price · status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {units.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">
                  <p className="font-semibold">{u.label}</p>
                  <p className="text-xs text-slate-400">{facilities.length > 1 ? u.facility.name : u.leases[0]?.contact.name ?? ""}</p>
                </td>
                <td className="px-4 py-2"><Badge color={COLOR[u.status]}>{u.status.toLowerCase()}</Badge></td>
                <td className="px-4 py-2">
                  <form action={updateUnit.bind(null, orgSlug)} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <Input name="size" defaultValue={u.size} className="w-20" aria-label="Size" />
                    <Input name="price" defaultValue={(u.monthlyPriceCents / 100).toFixed(2)} className="w-24" aria-label="Monthly price" />
                    {(u.status === "AVAILABLE" || u.status === "MAINTENANCE") && (
                      <Select name="status" defaultValue={u.status} aria-label="Status"><option value="AVAILABLE">available</option><option value="MAINTENANCE">maintenance</option></Select>
                    )}
                    <button className="rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50">Save</button>
                  </form>
                </td>
                <td className="px-4 py-2 text-right">
                  {u.leases.length === 0 && u.status !== "OCCUPIED" && (
                    <form action={deleteUnit.bind(null, orgSlug)}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" title={`Delete ${u.label} (${fmtMoney(u.monthlyPriceCents)})`}>Delete</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {units.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No units yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
