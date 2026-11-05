import { notFound } from "next/navigation";
import { getBookingFacility } from "@/lib/facility/public";
import { applyRentCheckout } from "@/lib/facility/sync";
import { stripe } from "@/lib/billing/stripe";
import { Card } from "@/components/ui";

export default async function BookingDone({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { slug } = await params;
  const { session_id } = await searchParams;
  const page = await getBookingFacility(slug);
  if (!page) notFound();

  let ok = false;
  if (session_id && /^cs_[A-Za-z0-9_]+$/.test(session_id)) {
    const s = await stripe().checkout.sessions.retrieve(session_id).catch(() => null);
    if (s?.metadata?.kind === "rent" && s.metadata.orgId === page.facility.orgId && s.status === "complete") {
      await applyRentCheckout(s); // same as the webhook; safe to run twice
      ok = true;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md text-center">
        <div className="text-5xl" aria-hidden>{ok ? "🎉" : "⏳"}</div>
        <h1 className="mt-3 text-xl font-bold">{ok ? "You're all set!" : "Finishing up…"}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {ok
            ? `Your unit at ${page.facility.name} is booked and autopay is on. A receipt is on its way to your email. The facility will contact you with access details.`
            : "We're confirming your payment. Refresh in a moment, or check your email for a receipt."}
        </p>
        {page.facility.phone && <p className="mt-4 text-sm text-slate-500">Questions? Call {page.facility.phone}</p>}
      </Card>
    </div>
  );
}
