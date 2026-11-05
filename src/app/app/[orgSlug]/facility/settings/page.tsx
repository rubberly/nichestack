import type { Metadata } from "next";
import { requireFacility } from "@/lib/facility/access";
import { refreshConnectStatus } from "@/lib/facility/connect";
import { feeConfig } from "@/lib/facility/rent";
import { can } from "@/lib/permissions";
import { appUrl } from "@/lib/site";
import { SubmitButton } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { FacilityForm } from "../facility-form";
import { connectPayments, openPayoutDashboard } from "../actions";

export const metadata: Metadata = { title: "Facility settings" };

export default async function FacilitySettings({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ connect?: string }> }) {
  const { orgSlug } = await params;
  const { connect } = await searchParams;
  const ctx = await requireFacility(orgSlug, "org:update");

  let ready = ctx.org.connectChargesReady;
  let details = false;
  if (ctx.org.connectAccountId && (connect || !ready)) {
    const s = await refreshConnectStatus(ctx.db, ctx.org.id, ctx.org.connectAccountId).catch(() => null);
    if (s) ({ ready, detailsSubmitted: details } = s);
  }
  const facilities = await ctx.db.facility.findMany({ orderBy: { createdAt: "asc" } });
  const fee = feeConfig();
  const owner = can(ctx.role, "billing:manage");

  return (
    <>
      <PageHeader title="Settings & payments" />

      <Card className="mb-6 max-w-2xl">
        <h2 className="font-semibold">Online rent payments</h2>
        {ready ? (
          <>
            <p className="mt-2 text-sm text-emerald-700">✓ Connected. Tenants can pay online and use autopay. Payouts go to your bank automatically.</p>
            {owner && <form action={openPayoutDashboard.bind(null, orgSlug)} className="mt-3"><SubmitButton variant="secondary">Payouts &amp; bank details ↗</SubmitButton></form>}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Connect your bank through Stripe (about 5 minutes) to collect rent by card, offer autopay and take online bookings.
            </p>
            {connect === "return" && !details && <div className="mt-3"><Notice tone="warn">Stripe still needs a few details. Click below to finish.</Notice></div>}
            {connect === "return" && details && <div className="mt-3"><Notice>Thanks! Stripe is verifying your details. This usually takes a few minutes.</Notice></div>}
            {owner ? (
              <form action={connectPayments.bind(null, orgSlug)} className="mt-3"><SubmitButton>{ctx.org.connectAccountId ? "Finish connecting" : "Connect payments"}</SubmitButton></form>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Ask an owner to connect payments.</p>
            )}
          </>
        )}
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Card payments: you receive the rent minus card processing ({fee.cardPercent}% + {fee.cardFixedCents}¢, passed through at cost)
          and a {fee.platformPercent}% platform fee. Cash and check payments you record by hand are free.
        </p>
      </Card>

      {facilities.map((f) => (
        <Card key={f.id} className="mb-6 max-w-2xl">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{f.name}</h2>
            <a href={`/book/${f.slug}`} target="_blank" className="text-sm text-brand-600 hover:underline">{appUrl(`/book/${f.slug}`)} ↗</a>
          </div>
          <FacilityForm slug={orgSlug} facility={f} />
        </Card>
      ))}
      {ctx.limits.facilities === null && (
        <Card className="max-w-2xl"><h2 className="mb-4 font-semibold">Add another facility</h2><FacilityForm slug={orgSlug} /></Card>
      )}
    </>
  );
}
