import Link from "next/link";
import { requireFacility } from "@/lib/facility/access";

export default async function FacilityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireFacility(orgSlug);
  const base = `/app/${orgSlug}/facility`;
  const tabs = [
    ["", "Dashboard"],
    ["/units", "Units"],
    ["/tenants", "Tenants"],
    ["/import", "Import"],
    ["/settings", "Settings & payments"],
  ];
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        {tabs.map(([p, label]) => (
          <Link key={p} href={base + p} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white">
            {label}
          </Link>
        ))}
      </div>
      {!ctx.org.connectChargesReady && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Online rent payments are off.</strong> Connect your bank in{" "}
          <Link href={`${base}/settings`} className="font-semibold underline">Settings &amp; payments</Link> to turn on autopay and online booking.
        </div>
      )}
      {children}
    </div>
  );
}
