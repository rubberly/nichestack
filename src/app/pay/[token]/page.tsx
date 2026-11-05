import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getPayLease } from "@/lib/facility/public";
import { applyRentCheckout } from "@/lib/facility/sync";
import { createRentCheckout } from "@/lib/facility/payments";
import { fmtMoney, monthsOwed } from "@/lib/facility/rent";
import { rateLimit } from "@/lib/ratelimit";
import { stripe } from "@/lib/billing/stripe";
import { SubmitButton } from "@/components/action-form";
import { Card, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Pay rent", robots: { index: false } };

async function checkout(token: string, mode: "once" | "autopay") {
  "use server";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`pay:${ip}`, 20, 3600)).ok) redirect(`/pay/${token}?error=busy`);
  const l = await getPayLease(token);
  if (!l || l.status === "ENDED") notFound();
  if (mode === "autopay" && (l.autopay || monthsOwed(l.paidThrough, new Date()) > 1)) redirect(`/pay/${token}`);
  let url: string;
  try {
    const s = await createRentCheckout(
      {
        orgId: l.orgId, connectAccountId: l.org.connectAccountId, connectChargesReady: l.org.connectChargesReady,
        leaseId: l.id, rentCents: l.monthlyRentCents, paidThrough: l.paidThrough,
        unitLabel: l.unit.label, facilityName: l.unit.facility.name, email: l.contact.email,
      },
      mode,
      { returnPath: `/pay/${token}` },
    );
    url = s.url!;
  } catch {
    redirect(`/pay/${token}?error=unavailable`);
  }
  redirect(url);
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ session_id?: string; cancelled?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  let lease = await getPayLease(token);
  if (!lease) notFound();

  let justPaid = false;
  if (sp.session_id && /^cs_[A-Za-z0-9_]+$/.test(sp.session_id)) {
    const s = await stripe().checkout.sessions.retrieve(sp.session_id).catch(() => null);
    if (s?.metadata?.leaseId === lease.id && s.status === "complete") {
      await applyRentCheckout(s);
      justPaid = true;
      lease = (await getPayLease(token))!;
    }
  }

  const f = lease.unit.facility;
  const now = new Date();
  const owedMonths = monthsOwed(lease.paidThrough, now);
  const ready = lease.org.connectChargesReady && !!lease.org.connectAccountId;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <p className="text-sm text-slate-500">{f.name}</p>
        <h1 className="mt-1 text-xl font-bold">Unit {lease.unit.label} · {lease.contact.name}</h1>

        <div className="mt-4 space-y-3">
          {justPaid && <Notice tone="success">Thank you! Your payment went through. A receipt is on its way to your email.</Notice>}
          {sp.cancelled && <Notice>Payment cancelled. Nothing was charged.</Notice>}
          {sp.error && <Notice tone="error">Online payment isn&apos;t available right now. Please contact {f.name}{f.phone ? ` at ${f.phone}` : ""}.</Notice>}
        </div>

        {lease.status === "ENDED" ? (
          <p className="mt-4 text-sm text-slate-600">This rental has ended. Thanks for storing with us!</p>
        ) : (
          <>
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              {owedMonths > 0 ? (
                <>
                  <p className="text-sm text-slate-500">Amount due</p>
                  <p className="text-3xl font-extrabold">{fmtMoney(owedMonths * lease.monthlyRentCents)}</p>
                  <p className="text-sm text-slate-500">{owedMonths} month{owedMonths > 1 ? "s" : ""} · due since {fmtDate(lease.paidThrough)}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500">You&apos;re paid through</p>
                  <p className="text-2xl font-bold">{fmtDate(lease.paidThrough)}</p>
                  <p className="text-sm text-slate-500">Monthly rent {fmtMoney(lease.monthlyRentCents)}</p>
                </>
              )}
            </div>

            {lease.autopay ? (
              <p className="mt-4 text-sm text-emerald-700">✓ Autopay is on. Rent is charged automatically each month.</p>
            ) : ready ? (
              <div className="mt-5 space-y-2">
                {owedMonths > 0 && (
                  <form action={checkout.bind(null, token, "once")}><SubmitButton className="w-full py-3">Pay {fmtMoney(owedMonths * lease.monthlyRentCents)} now</SubmitButton></form>
                )}
                {owedMonths <= 1 && (
                  <form action={checkout.bind(null, token, "autopay")}>
                    <SubmitButton variant={owedMonths > 0 ? "secondary" : "primary"} className="w-full py-3">
                      {owedMonths > 0 ? "Pay now and turn on autopay" : "Turn on autopay"}
                    </SubmitButton>
                  </form>
                )}
                <p className="text-center text-xs text-slate-400">Secure card payment by Stripe.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Online payment isn&apos;t set up yet. Please pay {f.name} directly{f.phone ? ` (${f.phone})` : ""}.</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
